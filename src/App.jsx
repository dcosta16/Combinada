import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function App() {
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);

  const [vista, setVista] = useState("jornadas");
  const [jornadaSeleccionada, setJornadaSeleccionada] =
    useState(null);

  const [jornadas, setJornadas] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [pronosticosEnviados, setPronosticosEnviados] = useState(false);

  const [clasificacion, setClasificacion] = useState([]);
  const [premiosHistorial, setPremiosHistorial] =
    useState([]);

  const [pronosticosTodos, setPronosticosTodos] =
    useState([]);
  const [cuotas, setCuotas] = useState({});
  const [premiosJornada, setPremiosJornada] =
    useState({});

  const [adminJornada, setAdminJornada] = useState({
    nombre: "",
    fecha_inicio: "",
    fecha_fin: "",
    responsable_id: "",
    estado: "abierta",
  });

  const [nuevoPartido, setNuevoPartido] = useState({
    equipo_local: "",
    equipo_visitante: "",
  });

  const [resultados, setResultados] = useState({});
  const [jugadores, setJugadores] = useState([]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const esAdmin =
    perfil?.rol?.toLowerCase() === "admin" ||
    perfil?.rol?.toLowerCase() === "administrador";

  const esResponsable =
    jornadaSeleccionada?.responsable_id ===
    session?.user?.id;

  useEffect(() => {
    comprobarSesion();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event, nuevaSesion) => {
        setSession(nuevaSesion);

        if (!nuevaSesion) {
          setPerfil(null);
          return;
        }

        await cargarDatosUsuario(nuevaSesion.user.id);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      cargarJornadas();
    }
  }, [session]);

  async function comprobarSesion() {
    const {
      data: { session: sesionActual },
    } = await supabase.auth.getSession();

    setSession(sesionActual);

    if (sesionActual) {
      await cargarDatosUsuario(sesionActual.user.id);
    }
  }

  async function cargarDatosUsuario(userId) {
    const { data, error } = await supabase
      .from("perfiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "Error cargando perfil:",
        error
      );
      return;
    }

    setPerfil(data);
  }

  async function login(event) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");
    setMessage("");

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      setErrorMessage(
        "Usuario o contraseña incorrectos."
      );
      setLoading(false);
      return;
    }

    setSession(data.session);

    if (data.session) {
      await cargarDatosUsuario(data.session.user.id);
    }

    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();

    setSession(null);
    setPerfil(null);
    setVista("jornadas");
    setJornadaSeleccionada(null);
    setPronosticos({});
    setPronosticosTodos([]);
    setCuotas({});
    setPremiosJornada({});
    setResultados({});
    setMessage("");
    setErrorMessage("");
  }

  /*
   * CIERRE AUTOMÁTICO
   *
   * Una jornada se considera cerrada cuando:
   * fecha_fin + 12:00 ya ha pasado.
   */
  async function actualizarEstadosAutomaticamente(
    jornadasData
  ) {
    const ahora = new Date();

    const jornadasActualizadas = [];

    for (const jornada of jornadasData || []) {
      if (
        jornada.estado === "abierta" &&
        jornada.fecha_fin
      ) {
        const fechaCierre = new Date(
          `${jornada.fecha_fin.substring(
            0,
            10
          )}T12:00:00`
        );

        if (ahora >= fechaCierre) {
          const { error } = await supabase
            .from("jornadas")
            .update({
              estado: "cerrada",
            })
            .eq("id", jornada.id)
            .eq("estado", "abierta");

          if (error) {
            console.error(
              "Error cerrando automáticamente la jornada:",
              error
            );
          }

          jornadasActualizadas.push({
            ...jornada,
            estado: "cerrada",
          });

          continue;
        }
      }

      jornadasActualizadas.push(jornada);
    }

    return jornadasActualizadas;
  }

  async function cargarJornadas() {
    setLoading(true);

    const { data, error } = await supabase
      .from("jornadas")
      .select("*")
      .order("id", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Error cargando jornadas:",
        error
      );

      setErrorMessage(
        "No se pudieron cargar las jornadas."
      );

      setLoading(false);
      return;
    }

    const jornadasConEstadoActualizado =
      await actualizarEstadosAutomaticamente(
        data || []
      );

    setJornadas(
      jornadasConEstadoActualizado
    );

    setLoading(false);
  }

  async function cargarJugadores() {
    const { data, error } = await supabase
      .from("perfiles")
      .select("id, nombre, rol")
      .order("nombre", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Error cargando jugadores:",
        error
      );
      return;
    }

    setJugadores(data || []);
  }

  /*
   * CARGAR JORNADA
   *
   * Jornada abierta:
   *   Solo se cargan los pronósticos del usuario actual.
   *
   * Jornada cerrada:
   *   Se cargan TODOS los pronósticos.
   */
  async function cargarJornada(jornada) {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    let jornadaActual = {
      ...jornada,
    };

    if (
      jornadaActual.estado === "abierta" &&
      jornadaActual.fecha_fin
    ) {
      const ahora = new Date();

      const fechaCierre = new Date(
        `${jornadaActual.fecha_fin.substring(
          0,
          10
        )}T12:00:00`
      );

      if (ahora >= fechaCierre) {
        const { error: cierreError } =
          await supabase
            .from("jornadas")
            .update({
              estado: "cerrada",
            })
            .eq("id", jornadaActual.id)
            .eq("estado", "abierta");

        if (!cierreError) {
          jornadaActual = {
            ...jornadaActual,
            estado: "cerrada",
          };

          setJornadas((actuales) =>
            actuales.map((j) =>
              j.id === jornadaActual.id
                ? jornadaActual
                : j
            )
          );
        }
      }
    }

    const {
      data: partidosData,
      error: partidosError,
    } = await supabase
      .from("partidos")
      .select("*")
      .eq(
        "jornada_id",
        jornadaActual.id
      )
      .order("id", {
        ascending: true,
      });

    if (partidosError) {
      console.error(
        "Error cargando partidos:",
        partidosError
      );

      setErrorMessage(
        "No se pudieron cargar los partidos."
      );

      setLoading(false);
      return;
    }

    setPartidos(partidosData || []);

    const partidoIds = (
      partidosData || []
    ).map((partido) => partido.id);

    /*
     * JORNADA ABIERTA
     */
    if (
      jornadaActual.estado === "abierta"
    ) {
      if (partidoIds.length > 0) {
        const {
          data: pronosticosData,
          error: pronosticosError,
        } = await supabase
          .from("pronosticos")
          .select("*")
          .eq(
            "usuario_id",
            session.user.id
          )
          .in(
            "partido_id",
            partidoIds
          );

        if (pronosticosError) {
          console.error(
            "Error cargando pronósticos:",
            pronosticosError
          );
        } else {
          const nuevosPronosticos = {};

          (
            pronosticosData || []
          ).forEach((pronostico) => {
            nuevosPronosticos[
              pronostico.partido_id
            ] =
              pronostico.pronostico;
          });

          setPronosticos(
            nuevosPronosticos
          );

          const claveEnvio = `pronosticos_enviados_${session.user.id}_${jornadaActual.id}`;
          const enviadosGuardados =
            window.localStorage.getItem(claveEnvio) === "true";

          setPronosticosEnviados(enviadosGuardados);
        }
      } else {
        setPronosticos({});
        setPronosticosEnviados(false);
      }

      setPronosticosTodos([]);
      setCuotas({});
      setPremiosJornada({});
      setResultados({});

      setJornadaSeleccionada(
        jornadaActual
      );

      setVista("jornada");
      setLoading(false);

      return;
    }

    /*
     * JORNADA CERRADA
     *
     * Cargamos todos los pronósticos.
     */
    if (partidoIds.length > 0) {
      const {
        data: pronosticosData,
        error: pronosticosError,
      } = await supabase
        .from("pronosticos")
        .select("*")
        .in(
          "partido_id",
          partidoIds
        );

      if (pronosticosError) {
        console.error(
          "Error cargando pronósticos de la jornada cerrada:",
          pronosticosError
        );

        setErrorMessage(
          "No se pudieron cargar los pronósticos de la jornada."
        );

        setLoading(false);
        return;
      }

      const usuarioIds = [
        ...new Set(
          (pronosticosData || []).map(
            (pronostico) =>
              pronostico.usuario_id
          )
        ),
      ];

      let perfilesData = [];

      if (usuarioIds.length > 0) {
        const { data } = await supabase
          .from("perfiles")
          .select("id, nombre")
          .in(
            "id",
            usuarioIds
          );

        perfilesData = data || [];
      }

      const perfilesPorId =
        new Map(
          perfilesData.map(
            (jugador) => [
              jugador.id,
              jugador,
            ]
          )
        );

      const datosCompletos =
        (
          pronosticosData || []
        ).map(
          (pronostico) => ({
            ...pronostico,
            perfil:
              perfilesPorId.get(
                pronostico.usuario_id
              ),
          })
        );

      setPronosticosTodos(
        datosCompletos
      );
    } else {
      setPronosticosTodos([]);
    }

    /*
     * Cargar premios, cuotas y premios de la jornada.
     */
    const {
      data: premiosData,
      error: premiosError,
    } = await supabase
      .from("premios")
      .select("*")
      .eq(
        "jornada_id",
        jornadaActual.id
      );

    if (premiosError) {
      console.error(
        "Error cargando premios de la jornada:",
        premiosError
      );
    }

    const cuotasIniciales = {};
    const premiosIniciales = {};

    (premiosData || []).forEach(
      (premio) => {
        cuotasIniciales[
          premio.usuario_id
        ] =
          premio.cuota ?? "";

        premiosIniciales[
          premio.usuario_id
        ] =
          premio.premio ?? 0;
      }
    );

    setCuotas(cuotasIniciales);
    setPremiosJornada(
      premiosIniciales
    );

    /*
     * Resultados oficiales.
     */
    const resultadosIniciales = {};

    (partidosData || []).forEach(
      (partido) => {
        resultadosIniciales[
          partido.id
        ] =
          partido.resultado || "";
      }
    );

    setResultados(
      resultadosIniciales
    );

    setPronosticos({});
    setJornadaSeleccionada(
      jornadaActual
    );
    setVista("jornada");
    setLoading(false);
  }

  /*
   * PANEL DEL RESPONSABLE
   */
  async function cargarPanelResponsable(
    jornada
  ) {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const {
      data: partidosData,
      error: partidosError,
    } = await supabase
      .from("partidos")
      .select("*")
      .eq(
        "jornada_id",
        jornada.id
      )
      .order("id", {
        ascending: true,
      });

    if (partidosError) {
      console.error(
        "Error cargando partidos:",
        partidosError
      );

      setErrorMessage(
        "No se pudieron cargar los partidos."
      );

      setLoading(false);
      return;
    }

    setPartidos(partidosData || []);

    const partidoIds = (
      partidosData || []
    ).map((partido) => partido.id);

    if (partidoIds.length === 0) {
      setPronosticosTodos([]);
      setCuotas({});
      setJornadaSeleccionada(
        jornada
      );
      setVista("responsable");
      setLoading(false);
      return;
    }

    const {
      data: pronosticosData,
      error: pronosticosError,
    } = await supabase
      .from("pronosticos")
      .select("*")
      .in(
        "partido_id",
        partidoIds
      );

    if (pronosticosError) {
      console.error(
        "Error cargando pronósticos de jugadores:",
        pronosticosError
      );

      setErrorMessage(
        "No se pudieron cargar los pronósticos de los jugadores."
      );

      setLoading(false);
      return;
    }

    const usuarioIds = [
      ...new Set(
        (pronosticosData || []).map(
          (pronostico) =>
            pronostico.usuario_id
        )
      ),
    ];

    let perfiles = [];

    if (usuarioIds.length > 0) {
      const {
        data: perfilesData,
      } = await supabase
        .from("perfiles")
        .select("id, nombre")
        .in(
          "id",
          usuarioIds
        );

      perfiles =
        perfilesData || [];
    }

    const perfilesPorId =
      new Map(
        perfiles.map(
          (perfilJugador) => [
            perfilJugador.id,
            perfilJugador,
          ]
        )
      );

    const datosCompletos =
      (
        pronosticosData || []
      ).map(
        (pronostico) => ({
          ...pronostico,
          perfil:
            perfilesPorId.get(
              pronostico.usuario_id
            ),
        })
      );

    setPronosticosTodos(
      datosCompletos
    );

    const {
      data: premiosData,
      error: premiosError,
    } = await supabase
      .from("premios")
      .select(
        "id, usuario_id, cuota, premio, aciertos"
      )
      .eq(
        "jornada_id",
        jornada.id
      );

    if (premiosError) {
      console.error(
        "Error cargando cuotas:",
        premiosError
      );
    }

    const cuotasIniciales = {};

    (premiosData || []).forEach(
      (premio) => {
        cuotasIniciales[
          premio.usuario_id
        ] =
          premio.cuota ?? "";
      }
    );

    setCuotas(
      cuotasIniciales
    );

    setJornadaSeleccionada(
      jornada
    );

    setVista("responsable");
    setLoading(false);
  }

  function seleccionarPronostico(partidoId, opcion) {
    // Una vez enviados, los pronósticos quedan bloqueados.
    if (pronosticosEnviados) {
      return;
    }

    // Solo se pueden seleccionar pronósticos mientras la jornada está abierta.
    if (!jornadaSeleccionada || jornadaSeleccionada.estado !== "abierta") {
      return;
    }

    setPronosticos((actuales) => ({
      ...actuales,
      [partidoId]: opcion,
    }));
  }

  async function guardarPronosticos() {
    if (!jornadaSeleccionada) {
      return;
    }

    if (
      jornadaSeleccionada.estado !==
      "abierta"
    ) {
      setErrorMessage(
        "Esta jornada ya está cerrada."
      );
      return;
    }

    if (pronosticosEnviados) {
      setErrorMessage(
        "Ya has enviado tus pronósticos. No se pueden modificar."
      );
      return;
    }

    if (partidos.length === 0) {
      setErrorMessage(
        "No hay partidos en esta jornada."
      );
      return;
    }

    const partidosSinPronostico =
      partidos.filter(
        (partido) =>
          !pronosticos[
            partido.id
          ]
      );

    if (
      partidosSinPronostico.length >
      0
    ) {
      setErrorMessage(
        "Debes seleccionar 1, X o 2 en todos los partidos."
      );
      return;
    }

    setGuardando(true);
    setMessage("");
    setErrorMessage("");

    const filasPronosticos =
      partidos.map((partido) => ({
        usuario_id:
          session.user.id,
        partido_id:
          partido.id,
        pronostico:
          pronosticos[
            partido.id
          ],
      }));

    const { error } =
      await supabase
        .from("pronosticos")
        .upsert(
          filasPronosticos,
          {
            onConflict:
              "usuario_id,partido_id",
          }
        );

    if (error) {
      console.error(
        "Error guardando pronósticos:",
        error
      );

      setErrorMessage(
        "No se pudieron guardar los pronósticos."
      );

      setGuardando(false);
      return;
    }

    const claveEnvio = `pronosticos_enviados_${session.user.id}_${jornadaSeleccionada.id}`;
    window.localStorage.setItem(
      claveEnvio,
      "true"
    );

    setPronosticosEnviados(true);

    setMessage(
      "Pronósticos enviados correctamente. Ya no se pueden modificar."
    );

    setGuardando(false);
  }

  async function guardarCuota(
    usuarioId
  ) {
    if (!jornadaSeleccionada) {
      return;
    }

    if (
      !esResponsable &&
      !esAdmin
    ) {
      setErrorMessage(
        "Solo el responsable de la jornada puede modificar las cuotas."
      );
      return;
    }

    const cuotaTexto = String(
      cuotas[usuarioId] ?? ""
    )
      .replace(",", ".")
      .trim();

    const cuotaNumerica =
      Number(cuotaTexto);

    if (
      !Number.isFinite(
        cuotaNumerica
      ) ||
      cuotaNumerica <= 0
    ) {
      setErrorMessage(
        "Introduce una cuota válida."
      );
      return;
    }

    setGuardando(true);
    setMessage("");
    setErrorMessage("");

    const {
      data: existente,
      error: consultaError,
    } = await supabase
      .from("premios")
      .select("id")
      .eq(
        "jornada_id",
        jornadaSeleccionada.id
      )
      .eq(
        "usuario_id",
        usuarioId
      )
      .maybeSingle();

    if (consultaError) {
      console.error(
        consultaError
      );

      setErrorMessage(
        "No se pudo comprobar la cuota."
      );

      setGuardando(false);
      return;
    }

    let error = null;

    if (existente) {
      const resultado =
        await supabase
          .from("premios")
          .update({
            cuota:
              cuotaNumerica,
          })
          .eq(
            "id",
            existente.id
          );

      error =
        resultado.error;
    } else {
      const resultado =
        await supabase
          .from("premios")
          .insert({
            jornada_id:
              jornadaSeleccionada.id,
            usuario_id:
              usuarioId,
            cuota:
              cuotaNumerica,
          });

      error =
        resultado.error;
    }

    if (error) {
      console.error(
        "Error guardando cuota:",
        error
      );

      setErrorMessage(
        "No se pudo guardar la cuota."
      );

      setGuardando(false);
      return;
    }

    setMessage(
      "Cuota guardada correctamente."
    );

    setGuardando(false);
  }

  /*
   * CALCULAR GANADORES DE UNA JORNADA
   *
   * Reglas:
   *
   * 1. Solo participan en la victoria los
   *    jugadores que hayan presentado TODOS
   *    los pronósticos.
   *
   * 2. Gana quien tenga más aciertos.
   *
   * 3. Si empatan en aciertos, gana quien
   *    tenga mayor cuota.
   *
   * 4. Si empatan en aciertos y cuota,
   *    se reparte 1 entre todos.
   *
   *    2 jugadores -> 0.5
   *    3 jugadores -> 0.333...
   *    4 jugadores -> 0.25
   *
   * 5. Si todos tienen 0 aciertos,
   *    todos los jugadores completos son
   *    igualmente ganadores.
   */
  function calcularGanadoresJornada({
    partidosJornada,
    pronosticosJornada,
    premiosJornadaData,
  }) {
    if (
      !partidosJornada ||
      partidosJornada.length === 0
    ) {
      return [];
    }

    const usuarios = [
      ...new Set(
        (
          pronosticosJornada ||
          []
        ).map(
          (pronostico) =>
            pronostico.usuario_id
        )
      ),
    ];

    const jugadoresCompletos =
      usuarios
        .map((usuarioId) => {
          const apuestasUsuario =
            (
              pronosticosJornada ||
              []
            ).filter(
              (pronostico) =>
                pronostico.usuario_id ===
                usuarioId
            );

          /*
           * Debe existir exactamente un
           * pronóstico válido para cada partido.
           */
          const haCompletado =
            apuestasUsuario.length ===
              partidosJornada.length &&
            partidosJornada.every(
              (partido) =>
                apuestasUsuario.some(
                  (apuesta) =>
                    apuesta.partido_id ===
                      partido.id &&
                    ["1", "X", "2"].includes(
                      apuesta.pronostico
                    )
                )
            );

          if (!haCompletado) {
            return null;
          }

          const aciertos =
            partidosJornada.reduce(
              (
                total,
                partido
              ) => {
                const apuesta =
                  apuestasUsuario.find(
                    (pronostico) =>
                      pronostico.partido_id ===
                      partido.id
                  );

                if (
                  apuesta?.pronostico &&
                  partido.resultado &&
                  apuesta.pronostico ===
                    partido.resultado
                ) {
                  return (
                    total + 1
                  );
                }

                return total;
              },
              0
            );

          const premioJugador =
            (
              premiosJornadaData ||
              []
            ).find(
              (premio) =>
                premio.usuario_id ===
                usuarioId
            );

          const cuota =
            Number(
              premioJugador?.cuota
            ) || 0;

          return {
            usuarioId,
            aciertos,
            cuota,
          };
        })
        .filter(Boolean);

    /*
     * Nadie ha presentado una jornada
     * completa.
     */
    if (
      jugadoresCompletos.length ===
      0
    ) {
      return [];
    }

    /*
     * Primero buscamos el máximo de
     * aciertos.
     */
    const maxAciertos =
      Math.max(
        ...jugadoresCompletos.map(
          (jugador) =>
            jugador.aciertos
        )
      );

    let candidatos =
      jugadoresCompletos.filter(
        (jugador) =>
          jugador.aciertos ===
          maxAciertos
      );

    /*
     * Si hay empate en aciertos,
     * utilizamos la cuota como segundo
     * criterio.
     */
    if (candidatos.length > 1) {
      const maxCuota =
        Math.max(
          ...candidatos.map(
            (jugador) =>
              jugador.cuota
          )
        );

      candidatos =
        candidatos.filter(
          (jugador) =>
            jugador.cuota ===
            maxCuota
        );
    }

    /*
     * Repartimos una victoria entre
     * todos los candidatos.
     */
    const victoria =
      1 / candidatos.length;

    return candidatos.map(
      (jugador) => ({
        ...jugador,
        victoria,
      })
    );
  }

  /*
   * CLASIFICACIÓN
   *
   * La clasificación ya no depende de que
   * exista una fila en "premios".
   *
   * Se calcula:
   *
   * - Aciertos reales a partir de
   *   pronósticos + resultados.
   * - Jornadas ganadas según las reglas
   *   definidas.
   * - Premios monetarios desde "premios".
   */
  async function cargarClasificacion() {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    /*
     * Cargamos jugadores.
     */
    const {
      data: perfiles,
      error: perfilesError,
    } = await supabase
      .from("perfiles")
      .select(
        "id, nombre, rol"
      )
      .order("nombre", {
        ascending: true,
      });

    if (perfilesError) {
      console.error(
        "Error cargando perfiles:",
        perfilesError
      );

      setErrorMessage(
        "No se pudieron cargar los jugadores."
      );

      setLoading(false);
      return;
    }

    /*
     * Cargamos jornadas.
     */
    const {
      data: jornadasData,
      error: jornadasError,
    } = await supabase
      .from("jornadas")
      .select("*")
      .order("id", {
        ascending: true,
      });

    if (jornadasError) {
      console.error(
        "Error cargando jornadas para la clasificación:",
        jornadasError
      );

      setErrorMessage(
        "No se pudieron cargar las jornadas."
      );

      setLoading(false);
      return;
    }

    /*
     * Actualizamos automáticamente jornadas
     * que ya deberían estar cerradas.
     */
    const jornadasActualizadas =
      await actualizarEstadosAutomaticamente(
        jornadasData || []
      );

    /*
     * Solo las jornadas cerradas participan
     * en la clasificación.
     */
    const jornadasCerradas =
      jornadasActualizadas.filter(
        (jornada) =>
          jornada.estado ===
          "cerrada"
      );

    /*
     * Cargamos todos los premios.
     *
     * Los premios siguen utilizándose para
     * calcular el dinero acumulado y las
     * cuotas de desempate.
     */
    const {
      data: premios,
      error: premiosError,
    } = await supabase
      .from("premios")
      .select("*");

    if (premiosError) {
      console.error(
        "Error cargando premios:",
        premiosError
      );

      setErrorMessage(
        "No se pudo cargar la clasificación."
      );

      setLoading(false);
      return;
    }

    /*
     * Estadísticas iniciales.
     *
     * Excluimos administradores de la
     * clasificación.
     */
    const estadisticasPorUsuario =
      new Map();

    (
      perfiles || []
    ).forEach((jugador) => {
      const rol =
        jugador.rol?.toLowerCase();

      if (
        rol === "admin" ||
        rol ===
          "administrador"
      ) {
        return;
      }

      estadisticasPorUsuario.set(
        jugador.id,
        {
          nombre:
            jugador.nombre?.trim() ||
            "Nombre no disponible",
          usuarioId:
            jugador.id,
          totalAciertos: 0,
          jornadasGanadas: 0,
          totalPremios: 0,
        }
      );
    });

    /*
     * Los premios monetarios se acumulan
     * independientemente de que el jugador
     * haya ganado o no una jornada.
     */
    (
      premios || []
    ).forEach((premio) => {
      const estadistica =
        estadisticasPorUsuario.get(
          premio.usuario_id
        );

      if (!estadistica) {
        return;
      }

      estadistica.totalPremios +=
        Number(
          premio.premio
        ) || 0;
    });

    /*
     * Recorremos cada jornada cerrada.
     */
    for (const jornada of jornadasCerradas) {
      /*
       * Partidos de la jornada.
       */
      const {
        data: partidosJornada,
        error: partidosError,
      } = await supabase
        .from("partidos")
        .select(
          "id, resultado"
        )
        .eq(
          "jornada_id",
          jornada.id
        )
        .order("id", {
          ascending: true,
        });

      if (partidosError) {
        console.error(
          `Error cargando partidos de la jornada ${jornada.id}:`,
          partidosError
        );

        continue;
      }

      if (
        !partidosJornada ||
        partidosJornada.length ===
          0
      ) {
        continue;
      }

      /*
       * Pronósticos de la jornada.
       */
      const partidoIds =
        partidosJornada.map(
          (partido) =>
            partido.id
        );

      const {
        data: pronosticosJornada,
        error: pronosticosError,
      } = await supabase
        .from("pronosticos")
        .select(
          "usuario_id, partido_id, pronostico"
        )
        .in(
          "partido_id",
          partidoIds
        );

      if (pronosticosError) {
        console.error(
          `Error cargando pronósticos de la jornada ${jornada.id}:`,
          pronosticosError
        );

        continue;
      }

      /*
       * Premios/cuotas de esta jornada.
       */
      const premiosJornadaData =
        (
          premios || []
        ).filter(
          (premio) =>
            premio.jornada_id ===
            jornada.id
        );

      /*
       * Calculamos los ganadores.
       */
      const ganadores =
        calcularGanadoresJornada({
          partidosJornada,
          pronosticosJornada:
            pronosticosJornada ||
            [],
          premiosJornadaData,
        });

      /*
       * Calculamos los aciertos de TODOS
       * los jugadores que hayan completado
       * la jornada.
       *
       * Esto permite que los aciertos
       * aparezcan aunque no hayan ganado
       * ni tengan premio monetario.
       */
      const usuariosJornada = [
        ...new Set(
          (
            pronosticosJornada ||
            []
          ).map(
            (pronostico) =>
              pronostico.usuario_id
          )
        ),
      ];

      usuariosJornada.forEach(
        (usuarioId) => {
          const estadistica =
            estadisticasPorUsuario.get(
              usuarioId
            );

          if (!estadistica) {
            return;
          }

          const apuestasUsuario =
            (
              pronosticosJornada ||
              []
            ).filter(
              (pronostico) =>
                pronostico.usuario_id ===
                usuarioId
            );

          /*
           * Solo contamos la jornada para
           * los aciertos si la combinada
           * está completa.
           *
           * De esta forma un jugador que
           * entrega solo 8 de 10 no puede
           * acumular artificialmente los
           * aciertos de esa jornada.
           */
          const haCompletado =
            apuestasUsuario.length ===
              partidosJornada.length &&
            partidosJornada.every(
              (partido) =>
                apuestasUsuario.some(
                  (apuesta) =>
                    apuesta.partido_id ===
                      partido.id &&
                    ["1", "X", "2"].includes(
                      apuesta.pronostico
                    )
                )
            );

          if (!haCompletado) {
            return;
          }

          const aciertos =
            partidosJornada.reduce(
              (
                total,
                partido
              ) => {
                const apuesta =
                  apuestasUsuario.find(
                    (pronostico) =>
                      pronostico.partido_id ===
                      partido.id
                  );

                return (
                  total +
                  (apuesta?.pronostico ===
                  partido.resultado
                    ? 1
                    : 0)
                );
              },
              0
            );

          estadistica.totalAciertos +=
            aciertos;
        }
      );

      /*
       * Sumamos la fracción de victoria.
       *
       * Ejemplos:
       * 1 ganador -> +1
       * 2 empatados -> +0.5
       * 3 empatados -> +0.333...
       */
      ganadores.forEach(
        (ganador) => {
          const estadistica =
            estadisticasPorUsuario.get(
              ganador.usuarioId
            );

          if (!estadistica) {
            return;
          }

          estadistica.jornadasGanadas +=
            ganador.victoria;
        }
      );
    }

    /*
     * Convertimos a array.
     */
    const estadisticas = Array.from(
      estadisticasPorUsuario.values()
    );

    /*
     * Orden:
     *
     * 1. Jornadas ganadas
     * 2. Aciertos
     * 3. Premios
     */
    estadisticas.sort((a, b) => {
      if (
        b.jornadasGanadas !==
        a.jornadasGanadas
      ) {
        return (
          b.jornadasGanadas -
          a.jornadasGanadas
        );
      }

      if (
        b.totalAciertos !==
        a.totalAciertos
      ) {
        return (
          b.totalAciertos -
          a.totalAciertos
        );
      }

      return (
        b.totalPremios -
        a.totalPremios
      );
    });

    setClasificacion(
      estadisticas
    );

    setLoading(false);
  }

  async function cargarPremiosHistorial() {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const {
      data: premios,
      error,
    } = await supabase
      .from("premios")
      .select(
        "*, jornadas(nombre)"
      )
      .gt("premio", 0)
      .order("jornada_id", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Error cargando premios:",
        error
      );

      setErrorMessage(
        "No se pudieron cargar los premios."
      );

      setLoading(false);
      return;
    }

    const usuarioIds = [
      ...new Set(
        (premios || []).map(
          (premio) =>
            premio.usuario_id
        )
      ),
    ];

    let perfiles = [];

    if (
      usuarioIds.length > 0
    ) {
      const {
        data: perfilesData,
      } = await supabase
        .from("perfiles")
        .select(
          "id, nombre"
        )
        .in(
          "id",
          usuarioIds
        );

      perfiles =
        perfilesData || [];
    }

    const perfilesPorId =
      new Map(
        perfiles.map(
          (jugador) => [
            jugador.id,
            jugador,
          ]
        )
      );

    const premiosConNombre =
      (
        premios || []
      ).map(
        (premio) => ({
          ...premio,
          perfil:
            perfilesPorId.get(
              premio.usuario_id
            ),
        })
      );

    setPremiosHistorial(
      premiosConNombre
    );

    setLoading(false);
  }

  async function cambiarVista(
    nuevaVista
  ) {
    setVista(nuevaVista);
    setMessage("");
    setErrorMessage("");

    if (
      nuevaVista ===
      "jornadas"
    ) {
      await cargarJornadas();
    }

    if (
      nuevaVista ===
      "clasificacion"
    ) {
      await cargarClasificacion();
    }

    if (
      nuevaVista ===
      "premios"
    ) {
      await cargarPremiosHistorial();
    }

    if (
      nuevaVista ===
      "administracion"
    ) {
      await cargarJugadores();
      await cargarJornadas();
    }
  }

  function abrirAdministracion() {
    setVista(
      "administracion"
    );

    cargarJugadores();
    cargarJornadas();
  }

  async function crearJornada(
    event
  ) {
    event.preventDefault();

    if (!esAdmin) {
      return;
    }

    setGuardando(true);
    setMessage("");
    setErrorMessage("");

    if (
      !adminJornada.nombre.trim()
    ) {
      setErrorMessage(
        "Introduce un nombre para la jornada."
      );

      setGuardando(false);
      return;
    }

    if (
      !adminJornada.fecha_inicio
    ) {
      setErrorMessage(
        "Introduce la fecha de inicio."
      );

      setGuardando(false);
      return;
    }

    if (
      !adminJornada.fecha_fin
    ) {
      setErrorMessage(
        "Introduce la fecha límite."
      );

      setGuardando(false);
      return;
    }

    const { error } =
      await supabase
        .from("jornadas")
        .insert({
          nombre:
            adminJornada.nombre.trim(),
          fecha_inicio:
            adminJornada.fecha_inicio,
          fecha_fin:
            adminJornada.fecha_fin,
          responsable_id:
            adminJornada.responsable_id ||
            null,
          estado: "abierta",
        });

    if (error) {
      console.error(
        "Error creando jornada:",
        error
      );

      setErrorMessage(
        "No se pudo crear la jornada."
      );

      setGuardando(false);
      return;
    }

    setAdminJornada({
      nombre: "",
      fecha_inicio: "",
      fecha_fin: "",
      responsable_id: "",
      estado: "abierta",
    });

    setMessage(
      "Jornada creada correctamente."
    );

    await cargarJornadas();

    setGuardando(false);
  }

  async function asignarResponsable(
    jornadaId,
    responsableId
  ) {
    if (!esAdmin) {
      return;
    }

    setGuardando(true);
    setMessage("");
    setErrorMessage("");

    const { error } =
      await supabase
        .from("jornadas")
        .update({
          responsable_id:
            responsableId || null,
        })
        .eq(
          "id",
          jornadaId
        );

    if (error) {
      console.error(
        "Error asignando responsable:",
        error
      );

      setErrorMessage(
        "No se pudo asignar el responsable."
      );

      setGuardando(false);
      return;
    }

    setMessage(
      "Responsable actualizado correctamente."
    );

    await cargarJornadas();

    setGuardando(false);
  }

  async function cambiarEstadoJornada(
    jornadaId,
    nuevoEstado
  ) {
    if (!esAdmin) {
      return;
    }

    setGuardando(true);
    setMessage("");
    setErrorMessage("");

    const { error } =
      await supabase
        .from("jornadas")
        .update({
          estado:
            nuevoEstado,
        })
        .eq(
          "id",
          jornadaId
        );

    if (error) {
      console.error(
        "Error cambiando estado:",
        error
      );

      setErrorMessage(
        "No se pudo cambiar el estado."
      );

      setGuardando(false);
      return;
    }

    setMessage(
      "Estado actualizado."
    );

    await cargarJornadas();

    setGuardando(false);
  }

  async function cargarPartidosAdmin(
    jornada
  ) {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const {
      data,
      error,
    } = await supabase
      .from("partidos")
      .select("*")
      .eq(
        "jornada_id",
        jornada.id
      )
      .order("id", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Error cargando partidos:",
        error
      );

      setErrorMessage(
        "No se pudieron cargar los partidos."
      );

      setLoading(false);
      return;
    }

    setPartidos(data || []);

    const resultadosIniciales = {};

    (data || []).forEach(
      (partido) => {
        resultadosIniciales[
          partido.id
        ] =
          partido.resultado || "";
      }
    );

    setResultados(
      resultadosIniciales
    );

    setJornadaSeleccionada(
      jornada
    );

    setVista(
      "admin-partidos"
    );

    setLoading(false);
  }

  async function crearPartido(
    event
  ) {
    event.preventDefault();

    if (
      !esAdmin ||
      !jornadaSeleccionada
    ) {
      return;
    }

    if (
      !nuevoPartido.equipo_local.trim()
    ) {
      setErrorMessage(
        "Introduce el equipo local."
      );
      return;
    }

    if (
      !nuevoPartido.equipo_visitante.trim()
    ) {
      setErrorMessage(
        "Introduce el equipo visitante."
      );
      return;
    }

    setGuardando(true);
    setMessage("");
    setErrorMessage("");

    const { error } =
      await supabase
        .from("partidos")
        .insert({
          jornada_id:
            jornadaSeleccionada.id,
          equipo_local:
            nuevoPartido.equipo_local.trim(),
          equipo_visitante:
            nuevoPartido.equipo_visitante.trim(),
        });

    if (error) {
      console.error(
        "Error creando partido:",
        error
      );

      setErrorMessage(
        "No se pudo crear el partido."
      );

      setGuardando(false);
      return;
    }

    setNuevoPartido({
      equipo_local: "",
      equipo_visitante: "",
    });

    setMessage(
      "Partido añadido correctamente."
    );

    await cargarPartidosAdmin(
      jornadaSeleccionada
    );

    setGuardando(false);
  }

  async function guardarResultado(
    partidoId
  ) {
    if (!esAdmin) {
      return;
    }

    const resultado =
      resultados[partidoId];

    if (
      !["1", "X", "2"].includes(
        resultado
      )
    ) {
      setErrorMessage(
        "El resultado debe ser 1, X o 2."
      );
      return;
    }

    setGuardando(true);
    setMessage("");
    setErrorMessage("");

    const { error } =
      await supabase
        .from("partidos")
        .update({
          resultado,
        })
        .eq(
          "id",
          partidoId
        );

    if (error) {
      console.error(
        "Error guardando resultado:",
        error
      );

      setErrorMessage(
        "No se pudo guardar el resultado."
      );

      setGuardando(false);
      return;
    }

    setMessage(
      "Resultado guardado correctamente."
    );

    setPartidos(
      (actuales) =>
        actuales.map(
          (partido) =>
            partido.id ===
            partidoId
              ? {
                  ...partido,
                  resultado,
                }
              : partido
        )
    );

    setGuardando(false);
  }

  async function volverAJornadas() {
    setJornadaSeleccionada(
      null
    );
    setPartidos([]);
    setPronosticos({});
    setPronosticosTodos([]);
    setCuotas({});
    setPremiosJornada({});
    setResultados({});

    await cambiarVista(
      "jornadas"
    );
  }

  function formatearFecha(
    fecha
  ) {
    if (!fecha) {
      return "-";
    }

    const valor =
      new Date(fecha);

    if (
      Number.isNaN(
        valor.getTime()
      )
    ) {
      return fecha;
    }

    return valor.toLocaleDateString(
      "es-ES"
    );
  }

  function obtenerNombreUsuario(
    usuarioId
  ) {
    const jugador =
      jugadores.find(
        (jugadorActual) =>
          jugadorActual.id ===
          usuarioId
      );

    return (
      jugador?.nombre ||
      "Jugador"
    );
  }

  /*
   * COMPROBAR SI UN PRONÓSTICO
   * HA ACERTADO
   */
  function pronosticoAcertado(
    partidoId,
    pronostico
  ) {
    const resultado =
      resultados[partidoId];

    if (
      !resultado ||
      !pronostico
    ) {
      return null;
    }

    return (
      resultado ===
      pronostico
    );
  }

  /*
   * Agrupa los pronósticos de la
   * jornada cerrada por jugador.
   */
  function obtenerJugadoresJornadaCerrada() {
    const ids = [
      ...new Set(
        pronosticosTodos.map(
          (pronostico) =>
            pronostico.usuario_id
        )
      ),
    ];

    return ids.map(
      (usuarioId) => {
        const apuestas =
          pronosticosTodos.filter(
            (pronostico) =>
              pronostico.usuario_id ===
              usuarioId
          );

        const aciertos =
          partidos.reduce(
            (
              total,
              partido
            ) => {
              const apuesta =
                apuestas.find(
                  (pronostico) =>
                    pronostico.partido_id ===
                    partido.id
                );

              return (
                total +
                (pronosticoAcertado(
                  partido.id,
                  apuesta?.pronostico
                )
                  ? 1
                  : 0)
              );
            },
            0
          );

        return {
          usuarioId,
          nombre:
            apuestas[0]
              ?.perfil?.nombre ||
            obtenerNombreUsuario(
              usuarioId
            ),
          apuestas,
          aciertos,
          cuota:
            cuotas[
              usuarioId
            ] ?? "",
          premio:
            premiosJornada[
              usuarioId
            ] ?? 0,
        };
      }
    );
  }

  /*
   * FORMATEAR VICTORIAS
   *
   * Para mostrar:
   * 1       -> 1
   * 0.5     -> 0.5
   * 0.3333  -> 0.33
   * 0.25    -> 0.25
   */
  function formatearVictorias(
    valor
  ) {
    const numero =
      Number(valor) || 0;

    if (
      Number.isInteger(
        numero
      )
    ) {
      return String(
        numero
      );
    }

    return numero
      .toFixed(2)
      .replace(
        /0+$/,
        ""
      )
      .replace(
        /\.$/,
        ""
      );
  }

  if (!session) {
    return (
      <main className="app">
        <section className="login-card">
          <div className="logo">
            ⚽
          </div>

          <p className="eyebrow">
            LA COMBINADA DE PIROLAS
          </p>

          <h1>
            COMBINADA
          </h1>

          <p className="subtitle">
            Entra para hacer tus
            pronósticos.
          </p>

          <form onSubmit={login}>
            <label htmlFor="email">
              Usuario
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="tu@email.com"
              autoComplete="username"
              required
            />

            <label htmlFor="password">
              Contraseña
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="Contraseña"
              autoComplete="current-password"
              required
            />

            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Entrando..."
                : "Entrar"}
            </button>

            {errorMessage && (
              <p className="error-message">
                {errorMessage}
              </p>
            )}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="dashboard">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              COMBINADA
            </span>

            <h1>
              {perfil?.nombre ||
                session.user.email}
            </h1>
          </div>

          <div className="topbar-actions">
            {esAdmin && (
              <span className="admin-badge">
                ADMINISTRADOR
              </span>
            )}

            <button
              className="secondary-button"
              onClick={logout}
            >
              Salir
            </button>
          </div>
        </header>

        {vista !== "jornada" &&
          vista !==
            "responsable" &&
          vista !==
            "admin-partidos" && (
            <nav className="main-nav">
              <button
                className={
                  vista ===
                  "jornadas"
                    ? "nav-active"
                    : ""
                }
                onClick={() =>
                  cambiarVista(
                    "jornadas"
                  )
                }
              >
                ⚽ Jornadas
              </button>

              <button
                className={
                  vista ===
                  "clasificacion"
                    ? "nav-active"
                    : ""
                }
                onClick={() =>
                  cambiarVista(
                    "clasificacion"
                  )
                }
              >
                🏆 Clasificación
              </button>

              <button
                className={
                  vista ===
                  "premios"
                    ? "nav-active"
                    : ""
                }
                onClick={() =>
                  cambiarVista(
                    "premios"
                  )
                }
              >
                💰 Premios
              </button>

              {esAdmin && (
                <button
                  className={
                    vista ===
                    "administracion"
                      ? "nav-active"
                      : ""
                  }
                  onClick={
                    abrirAdministracion
                  }
                >
                  ⚙️ Administración
                </button>
              )}
            </nav>
          )}

        {message && (
          <div className="global-message success-message">
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="global-message error-message">
            {errorMessage}
          </div>
        )}

        {/* JORNADAS */}
        {vista ===
          "jornadas" && (
          <section className="content">
            <div className="section-title">
              <p className="eyebrow">
                COMPETICIÓN
              </p>

              <h2>
                Jornadas
              </h2>

              <p className="section-description">
                Consulta las jornadas
                y realiza tus
                pronósticos antes
                del cierre.
              </p>
            </div>

            {loading ? (
              <div className="empty-card">
                Cargando
                jornadas...
              </div>
            ) : jornadas.length ===
              0 ? (
              <div className="empty-card">
                No hay jornadas
                disponibles.
              </div>
            ) : (
              <div className="list">
                {jornadas.map(
                  (jornada) => (
                    <article
                      className="list-card"
                      key={
                        jornada.id
                      }
                    >
                      <div className="round-number">
                        {
                          jornada.id
                        }
                      </div>

                      <div className="list-info">
                        <h3>
                          {jornada.nombre ||
                            `Jornada ${jornada.id}`}
                        </h3>

                        <p>
                          Cierre:{" "}
                          {formatearFecha(
                            jornada.fecha_fin
                          )}{" "}
                          a las 12:00
                        </p>

                        <span
                          className={`status-badge status-${jornada.estado}`}
                        >
                          {
                            jornada.estado
                          }
                        </span>
                      </div>

                      <div className="card-actions">
                        <button
                          className="small-button"
                          onClick={() =>
                            cargarJornada(
                              jornada
                            )
                          }
                        >
                          {jornada.estado ===
                          "cerrada"
                            ? "Ver resultados"
                            : "Ver jornada"}
                        </button>

                        {jornada.responsable_id ===
                          session
                            .user
                            .id && (
                          <button
                            className="small-button secondary-small"
                            onClick={() =>
                              cargarPanelResponsable(
                                jornada
                              )
                            }
                          >
                            Responsable
                          </button>
                        )}
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {/* JORNADA */}
        {vista ===
          "jornada" &&
          jornadaSeleccionada && (
            <section className="content">
              <button
                className="back-button"
                onClick={
                  volverAJornadas
                }
              >
                ← Volver a jornadas
              </button>

              {jornadaSeleccionada.estado ===
              "cerrada" ? (
                <>
                  <div className="section-title">
                    <p className="eyebrow">
                      JORNADA FINALIZADA
                    </p>

                    <h2>
                      {jornadaSeleccionada.nombre ||
                        `Jornada ${jornadaSeleccionada.id}`}
                    </h2>

                    <p className="section-description">
                      Resultados oficiales
                      y pronósticos
                      de todos los
                      jugadores.
                    </p>

                    <span className="status-badge status-cerrada">
                      CERRADA
                    </span>
                  </div>

                  <section className="closed-results-card">
                    <div className="closed-card-header">
                      <div>
                        <span className="eyebrow">
                          RESULTADOS
                          OFICIALES
                        </span>

                        <h3>
                          Resultados
                          de la
                          jornada
                        </h3>
                      </div>

                      <div className="closed-icon">
                        🏁
                      </div>
                    </div>

                    {partidos.length ===
                    0 ? (
                      <div className="empty-card">
                        No hay partidos
                        en esta
                        jornada.
                      </div>
                    ) : (
                      <div className="official-results">
                        {partidos.map(
                          (
                            partido,
                            index
                          ) => (
                            <article
                              className="official-result-row"
                              key={
                                partido.id
                              }
                            >
                              <div className="result-number">
                                {index +
                                  1}
                              </div>

                              <div className="result-teams">
                                <strong>
                                  {
                                    partido.equipo_local
                                  }
                                </strong>

                                <span>
                                  vs
                                </span>

                                <strong>
                                  {
                                    partido.equipo_visitante
                                  }
                                </strong>
                              </div>

                              <div className="official-result">
                                {partido.resultado ||
                                  "-"}
                              </div>
                            </article>
                          )
                        )}
                      </div>
                    )}
                  </section>

                  <section className="closed-results-card">
                    <div className="closed-card-header">
                      <div>
                        <span className="eyebrow">
                          PARTICIPANTES
                        </span>

                        <h3>
                          Pronósticos
                          de todos
                        </h3>
                      </div>

                      <div className="closed-icon">
                        👥
                      </div>
                    </div>

                    {pronosticosTodos.length ===
                    0 ? (
                      <div className="empty-card">
                        No hay
                        pronósticos
                        registrados.
                      </div>
                    ) : (
                      <div className="closed-player-list">
                        {obtenerJugadoresJornadaCerrada().map(
                          (
                            jugador
                          ) => (
                            <article
                              className="closed-player-card"
                              key={
                                jugador.usuarioId
                              }
                            >
                              <div className="closed-player-header">
                                <div>
                                  <span className="eyebrow">
                                    JUGADOR
                                  </span>

                                  <h4>
                                    {
                                      jugador.nombre
                                    }
                                  </h4>
                                </div>

                                <div className="player-summary">
                                  <div>
                                    <span>
                                      Aciertos
                                    </span>

                                    <strong>
                                      {
                                        jugador.aciertos
                                      }
                                    </strong>
                                  </div>

                                  <div>
                                    <span>
                                      Cuota
                                    </span>

                                    <strong>
                                      {jugador.cuota !==
                                        "" &&
                                      jugador.cuota !==
                                        null &&
                                      jugador.cuota !==
                                        undefined
                                        ? Number(
                                            jugador.cuota
                                          ).toFixed(
                                            2
                                          )
                                        : "-"}
                                    </strong>
                                  </div>

                                  {Number(
                                    jugador.premio
                                  ) >
                                    0 && (
                                    <div className="winner-summary">
                                      <span>
                                        Premio
                                      </span>

                                      <strong>
                                        {Number(
                                          jugador.premio
                                        ).toFixed(
                                          2
                                        )}{" "}
                                        €
                                      </strong>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="closed-predictions">
                                {partidos.map(
                                  (
                                    partido
                                  ) => {
                                    const apuesta =
                                      jugador.apuestas.find(
                                        (
                                          p
                                        ) =>
                                          p.partido_id ===
                                          partido.id
                                      );

                                    const acierto =
                                      pronosticoAcertado(
                                        partido.id,
                                        apuesta?.pronostico
                                      );

                                    return (
                                      <div
                                        className={`closed-prediction-row ${
                                          acierto ===
                                          true
                                            ? "prediction-correct"
                                            : acierto ===
                                              false
                                            ? "prediction-wrong"
                                            : ""
                                        }`}
                                        key={
                                          partido.id
                                        }
                                      >
                                        <div>
                                          <span>
                                            {
                                              partido.equipo_local
                                            }{" "}
                                            -{" "}
                                            {
                                              partido.equipo_visitante
                                            }
                                          </span>

                                          <small>
                                            Resultado:{" "}
                                            <strong>
                                              {partido.resultado ||
                                                "-"}
                                            </strong>
                                          </small>
                                        </div>

                                        <strong className="player-prediction">
                                          {apuesta?.pronostico ||
                                            "-"}
                                        </strong>

                                        {acierto ===
                                          true && (
                                          <span className="prediction-mark">
                                            ✓
                                          </span>
                                        )}

                                        {acierto ===
                                          false && (
                                          <span className="prediction-mark">
                                            ✕
                                          </span>
                                        )}
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                            </article>
                          )
                        )}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <div className="section-title">
                    <p className="eyebrow">
                      JORNADA
                    </p>

                    <h2>
                      {jornadaSeleccionada.nombre ||
                        `Jornada ${jornadaSeleccionada.id}`}
                    </h2>

                    <p className="jornada-status">
                      Fecha límite:{" "}
                      <strong>
                        {formatearFecha(
                          jornadaSeleccionada.fecha_fin
                        )}{" "}
                        a las 12:00
                      </strong>
                    </p>

                    <span className="status-badge status-abierta">
                      ABIERTA
                    </span>
                  </div>

                  {loading ? (
                    <div className="empty-card">
                      Cargando
                      partidos...
                    </div>
                  ) : partidos.length ===
                    0 ? (
                    <div className="empty-card">
                      No hay partidos
                      en esta
                      jornada.
                    </div>
                  ) : (
                    <div className="matches">
                      {partidos.map(
                        (
                          partido
                        ) => (
                          <article
                            className="match-card"
                            key={
                              partido.id
                            }
                          >
                            <div className="teams">
                              <strong>
                                {
                                  partido.equipo_local
                                }
                              </strong>

                              <span>
                                vs
                              </span>

                              <strong>
                                {
                                  partido.equipo_visitante
                                }
                              </strong>
                            </div>

                            <div className="prediction-buttons">
                              {[
                                "1",
                                "X",
                                "2",
                              ].map(
                                (
                                  opcion
                                ) => (
                                  <button
                                    key={
                                      opcion
                                    }
                                    disabled={
                                      pronosticosEnviados
                                    }
                                    className={
                                      pronosticos[
                                        partido.id
                                      ] ===
                                      opcion
                                        ? "prediction-selected"
                                        : ""
                                    }
                                    onClick={() =>
                                      seleccionarPronostico(
                                        partido.id,
                                        opcion
                                      )
                                    }
                                  >
                                    {
                                      opcion
                                    }
                                  </button>
                                )
                              )}
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  )}

                  {jornadaSeleccionada.estado ===
                    "abierta" && (
                    <>
                      {pronosticosEnviados ? (
                        <div className="empty-card">
                          ✓ Pronósticos enviados. Ya no se pueden modificar.
                        </div>
                      ) : (
                        <button
                          className="save-button"
                          onClick={
                            guardarPronosticos
                          }
                          disabled={
                            guardando
                          }
                        >
                          {guardando
                            ? "Enviando..."
                            : "Enviar pronósticos"}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </section>
          )}

        {/* RESPONSABLE */}
        {vista ===
          "responsable" &&
          jornadaSeleccionada && (
            <section className="content">
              <button
                className="back-button"
                onClick={
                  volverAJornadas
                }
              >
                ← Volver a jornadas
              </button>

              <div className="section-title">
                <p className="eyebrow">
                  RESPONSABLE
                </p>

                <h2>
                  {
                    jornadaSeleccionada.nombre
                  }
                </h2>

                <p className="section-description">
                  Consulta los
                  pronósticos de
                  todos los
                  jugadores y
                  asigna sus cuotas.
                </p>
              </div>

              {loading ? (
                <div className="empty-card">
                  Cargando
                  pronósticos...
                </div>
              ) : pronosticosTodos.length ===
                0 ? (
                <div className="empty-card">
                  <div className="big-icon">
                    📋
                  </div>

                  <h3>
                    Todavía no
                    hay
                    pronósticos
                  </h3>

                  <p>
                    Los jugadores
                    aún no han
                    enviado sus
                    combinadas.
                  </p>
                </div>
              ) : (
                <div className="responsable-list">
                  {[
                    ...new Set(
                      pronosticosTodos.map(
                        (p) =>
                          p.usuario_id
                      )
                    ),
                  ].map(
                    (usuarioId) => {
                      const apuestas =
                        pronosticosTodos.filter(
                          (p) =>
                            p.usuario_id ===
                            usuarioId
                        );

                      return (
                        <article
                          className="player-bet-card"
                          key={
                            usuarioId
                          }
                        >
                          <div className="player-bet-header">
                            <div>
                              <span className="eyebrow">
                                JUGADOR
                              </span>

                              <h3>
                                {apuestas[0]
                                  ?.perfil
                                  ?.nombre ||
                                  obtenerNombreUsuario(
                                    usuarioId
                                  )}
                              </h3>
                            </div>

                            <div className="quota-editor">
                              <label
                                htmlFor={`cuota-${usuarioId}`}
                              >
                                Cuota
                              </label>

                              <input
                                id={`cuota-${usuarioId}`}
                                type="number"
                                step="0.01"
                                min="0"
                                value={
                                  cuotas[
                                    usuarioId
                                  ] ?? ""
                                }
                                onChange={(
                                  event
                                ) =>
                                  setCuotas(
                                    (
                                      actuales
                                    ) => ({
                                      ...actuales,
                                      [usuarioId]:
                                        event
                                          .target
                                          .value,
                                    })
                                  )
                                }
                              />

                              <button
                                className="small-button"
                                onClick={() =>
                                  guardarCuota(
                                    usuarioId
                                  )
                                }
                                disabled={
                                  guardando
                                }
                              >
                                Guardar
                              </button>
                            </div>
                          </div>

                          <div className="player-predictions">
                            {partidos.map(
                              (
                                partido
                              ) => {
                                const apuesta =
                                  apuestas.find(
                                    (
                                      p
                                    ) =>
                                      p.partido_id ===
                                      partido.id
                                  );

                                return (
                                  <div
                                    className="prediction-row"
                                    key={
                                      partido.id
                                    }
                                  >
                                    <span>
                                      {
                                        partido.equipo_local
                                      }{" "}
                                      -{" "}
                                      {
                                        partido.equipo_visitante
                                      }
                                    </span>

                                    <strong>
                                      {apuesta
                                        ?.pronostico ||
                                        "-"}
                                    </strong>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </article>
                      );
                    }
                  )}
                </div>
              )}
            </section>
          )}

        {/* CLASIFICACIÓN */}
        {vista ===
          "clasificacion" && (
          <section className="content">
            <div className="section-title">
              <p className="eyebrow">
                TEMPORADA
              </p>

              <h2>
                Clasificación
              </h2>

              <p className="section-description">
                Clasificación general
                de la temporada.
              </p>
            </div>

            {loading ? (
              <div className="empty-card">
                Cargando
                clasificación...
              </div>
            ) : clasificacion.length ===
              0 ? (
              <div className="empty-card">
                <div className="big-icon">
                  🏆
                </div>

                <h3>
                  Todavía no
                  hay
                  clasificación
                </h3>

                <p>
                  Los resultados
                  aparecerán cuando
                  haya jornadas
                  cerradas.
                </p>
              </div>
            ) : (
              <div className="clasificacion-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Pos
                      </th>

                      <th>
                        Jugador
                      </th>

                      <th>
                        Aciertos
                      </th>

                      <th>
                        Jornadas
                        ganadas
                      </th>

                      <th>
                        Premios
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {clasificacion.map(
                      (
                        jugador,
                        index
                      ) => (
                        <tr
                          key={
                            jugador.usuarioId
                          }
                          className={
                            jugador.usuarioId ===
                            session
                              .user
                              .id
                              ? "current-user"
                              : ""
                          }
                        >
                          <td className="posicion">
                            {index ===
                            0
                              ? "🥇"
                              : index ===
                                1
                              ? "🥈"
                              : index ===
                                2
                              ? "🥉"
                              : index +
                                1}
                          </td>

                          <td className="nombre">
                            {
                              jugador.nombre
                            }
                          </td>

                          <td>
                            {
                              jugador.totalAciertos
                            }
                          </td>

                          <td>
                            {formatearVictorias(
                              jugador.jornadasGanadas
                            )}
                          </td>

                          <td>
                            {Number(
                              jugador.totalPremios
                            ).toFixed(
                              2
                            )}{" "}
                            €
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* PREMIOS */}
        {vista ===
          "premios" && (
          <section className="content">
            <div className="section-title">
              <p className="eyebrow">
                HISTORIAL
              </p>

              <h2>
                Premios
              </h2>

              <p className="section-description">
                Jornadas en las que
                se han obtenido
                premios.
              </p>
            </div>

            {loading ? (
              <div className="empty-card">
                Cargando
                premios...
              </div>
            ) : premiosHistorial.length ===
              0 ? (
              <div className="empty-card">
                <div className="big-icon">
                  💰
                </div>

                <h3>
                  Todavía no
                  hay premios
                </h3>

                <p>
                  Aquí aparecerán
                  únicamente los
                  premios superiores
                  a 0 €.
                </p>
              </div>
            ) : (
              <div className="premios-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Jornada
                      </th>

                      <th>
                        Jugador
                      </th>

                      <th>
                        Aciertos
                      </th>

                      <th>
                        Cuota
                      </th>

                      <th>
                        Premio
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {premiosHistorial.map(
                      (
                        premio
                      ) => (
                        <tr
                          key={
                            premio.id
                          }
                        >
                          <td>
                            {premio
                              .jornadas
                              ?.nombre ||
                              `Jornada ${premio.jornada_id}`}
                          </td>

                          <td className="nombre">
                            {premio
                              .perfil
                              ?.nombre ||
                              "Jugador"}
                          </td>

                          <td>
                            {premio.aciertos ||
                              0}
                          </td>

                          <td>
                            {premio.cuota !==
                              null &&
                            premio.cuota !==
                              undefined
                              ? Number(
                                  premio.cuota
                                ).toFixed(
                                  2
                                )
                              : "-"}
                          </td>

                          <td>
                            <strong>
                              {Number(
                                premio.premio
                              ).toFixed(
                                2
                              )}{" "}
                              €
                            </strong>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>

                <div className="premios-total">
                  <strong>
                    Total acumulado:
                  </strong>{" "}
                  {premiosHistorial
                    .reduce(
                      (
                        sum,
                        premio
                      ) =>
                        sum +
                        (Number(
                          premio.premio
                        ) || 0),
                      0
                    )
                    .toFixed(
                      2
                    )}{" "}
                  €
                </div>
              </div>
            )}
          </section>
        )}

        {/* ADMINISTRACIÓN */}
        {vista ===
          "administracion" &&
          esAdmin && (
            <section className="content admin-panel">
              <div className="admin-hero">
                <div>
                  <p className="eyebrow">
                    ADMINISTRACIÓN
                  </p>

                  <h2>
                    Panel de
                    administración
                  </h2>

                  <p>
                    Gestiona jornadas,
                    responsables,
                    partidos y
                    resultados.
                  </p>
                </div>

                <div className="admin-hero-icon">
                  ⚙️
                </div>
              </div>

              <div className="admin-grid">
                <section className="admin-card">
                  <div className="admin-card-header">
                    <div className="admin-card-icon">
                      📅
                    </div>

                    <div>
                      <h3>
                        Crear jornada
                      </h3>

                      <p>
                        Crea una nueva
                        jornada y
                        asigna su
                        responsable.
                      </p>
                    </div>
                  </div>

                  <form
                    className="admin-form"
                    onSubmit={
                      crearJornada
                    }
                  >
                    <label htmlFor="jornada-nombre">
                      Nombre
                    </label>

                    <input
                      id="jornada-nombre"
                      type="text"
                      value={
                        adminJornada.nombre
                      }
                      onChange={(
                        event
                      ) =>
                        setAdminJornada(
                          (
                            actual
                          ) => ({
                            ...actual,
                            nombre:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                      placeholder="Jornada 1"
                    />

                    <div className="form-row">
                      <div>
                        <label htmlFor="fecha-inicio">
                          Fecha
                          inicio
                        </label>

                        <input
                          id="fecha-inicio"
                          type="date"
                          value={
                            adminJornada.fecha_inicio
                          }
                          onChange={(
                            event
                          ) =>
                            setAdminJornada(
                              (
                                actual
                              ) => ({
                                ...actual,
                                fecha_inicio:
                                  event
                                    .target
                                    .value,
                              })
                            )
                          }
                        />
                      </div>

                      <div>
                        <label htmlFor="fecha-fin">
                          Fecha
                          límite
                        </label>

                        <input
                          id="fecha-fin"
                          type="date"
                          value={
                            adminJornada.fecha_fin
                          }
                          onChange={(
                            event
                          ) =>
                            setAdminJornada(
                              (
                                actual
                              ) => ({
                                ...actual,
                                fecha_fin:
                                  event
                                    .target
                                    .value,
                              })
                            )
                          }
                        />
                      </div>
                    </div>

                    <label htmlFor="responsable">
                      Responsable
                    </label>

                    <select
                      id="responsable"
                      value={
                        adminJornada.responsable_id
                      }
                      onChange={(
                        event
                      ) =>
                        setAdminJornada(
                          (
                            actual
                          ) => ({
                            ...actual,
                            responsable_id:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                    >
                      <option value="">
                        Sin
                        responsable
                      </option>

                      {jugadores
                        .filter(
                          (
                            jugador
                          ) =>
                            jugador.rol
                              ?.toLowerCase() !==
                            "admin"
                        )
                        .map(
                          (
                            jugador
                          ) => (
                            <option
                              key={
                                jugador.id
                              }
                              value={
                                jugador.id
                              }
                            >
                              {
                                jugador.nombre
                              }
                            </option>
                          )
                        )}
                    </select>

                    <p className="form-help">
                      Los jugadores
                      podrán apostar
                      hasta las 12:00
                      de la fecha
                      límite.
                    </p>

                    <button
                      type="submit"
                      disabled={
                        guardando
                      }
                    >
                      {guardando
                        ? "Creando..."
                        : "Crear jornada"}
                    </button>
                  </form>
                </section>

                <section className="admin-card admin-card-wide">
                  <div className="admin-card-header">
                    <div className="admin-card-icon">
                      📋
                    </div>

                    <div>
                      <h3>
                        Jornadas
                        existentes
                      </h3>

                      <p>
                        Gestiona
                        responsables,
                        partidos y
                        estado.
                      </p>
                    </div>
                  </div>

                  {jornadas.length ===
                  0 ? (
                    <div className="admin-empty">
                      No hay jornadas
                      creadas.
                    </div>
                  ) : (
                    <div className="admin-jornadas">
                      {jornadas.map(
                        (
                          jornada
                        ) => (
                          <article
                            className="admin-jornada"
                            key={
                              jornada.id
                            }
                          >
                            <div className="admin-jornada-main">
                              <div className="round-number">
                                {
                                  jornada.id
                                }
                              </div>

                              <div>
                                <h4>
                                  {
                                    jornada.nombre
                                  }
                                </h4>

                                <p>
                                  Inicio:{" "}
                                  {formatearFecha(
                                    jornada.fecha_inicio
                                  )}
                                </p>

                                <p>
                                  Límite:{" "}
                                  {formatearFecha(
                                    jornada.fecha_fin
                                  )}{" "}
                                  12:00
                                </p>

                                <span
                                  className={`status-badge status-${jornada.estado}`}
                                >
                                  {
                                    jornada.estado
                                  }
                                </span>
                              </div>
                            </div>

                            <div className="admin-jornada-controls">
                              <label>
                                Responsable
                              </label>

                              <select
                                value={
                                  jornada.responsable_id ||
                                  ""
                                }
                                onChange={(
                                  event
                                ) =>
                                  asignarResponsable(
                                    jornada.id,
                                    event
                                      .target
                                      .value
                                  )
                                }
                              >
                                <option value="">
                                  Sin
                                  responsable
                                </option>

                                {jugadores
                                  .filter(
                                    (
                                      jugador
                                    ) =>
                                      jugador.rol
                                        ?.toLowerCase() !==
                                      "admin"
                                  )
                                  .map(
                                    (
                                      jugador
                                    ) => (
                                      <option
                                        key={
                                          jugador.id
                                        }
                                        value={
                                          jugador.id
                                        }
                                      >
                                        {
                                          jugador.nombre
                                        }
                                      </option>
                                    )
                                  )}
                              </select>

                              <div className="admin-action-row">
                                <button
                                  className="small-button"
                                  onClick={() =>
                                    cargarPartidosAdmin(
                                      jornada
                                    )
                                  }
                                >
                                  ⚽ Partidos
                                </button>

                                {jornada.estado ===
                                "abierta" ? (
                                  <button
                                    className="small-button secondary-small"
                                    onClick={() =>
                                      cambiarEstadoJornada(
                                        jornada.id,
                                        "cerrada"
                                      )
                                    }
                                  >
                                    🔒
                                    Cerrar
                                  </button>
                                ) : (
                                  <button
                                    className="small-button secondary-small"
                                    onClick={() =>
                                      cambiarEstadoJornada(
                                        jornada.id,
                                        "abierta"
                                      )
                                    }
                                  >
                                    🔓
                                    Abrir
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  )}
                </section>
              </div>
            </section>
          )}

        {/* ADMINISTRACIÓN DE PARTIDOS */}
        {vista ===
          "admin-partidos" &&
          esAdmin &&
          jornadaSeleccionada && (
            <section className="content">
              <button
                className="back-button"
                onClick={() =>
                  cambiarVista(
                    "administracion"
                  )
                }
              >
                ← Volver a
                administración
              </button>

              <div className="section-title">
                <p className="eyebrow">
                  ADMINISTRACIÓN
                </p>

                <h2>
                  {
                    jornadaSeleccionada.nombre
                  }
                </h2>

                <p className="section-description">
                  Añade los partidos
                  y registra los
                  resultados oficiales.
                </p>
              </div>

              <section className="admin-card">
                <div className="admin-card-header">
                  <div className="admin-card-icon">
                    ⚽
                  </div>

                  <div>
                    <h3>
                      Añadir partido
                    </h3>

                    <p>
                      Introduce los dos
                      equipos.
                    </p>
                  </div>
                </div>

                <form
                  className="admin-form"
                  onSubmit={
                    crearPartido
                  }
                >
                  <div className="form-row">
                    <div>
                      <label>
                        Equipo local
                      </label>

                      <input
                        type="text"
                        value={
                          nuevoPartido.equipo_local
                        }
                        onChange={(
                          event
                        ) =>
                          setNuevoPartido(
                            (
                              actual
                            ) => ({
                              ...actual,
                              equipo_local:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                        placeholder="Real Madrid"
                      />
                    </div>

                    <div>
                      <label>
                        Equipo
                        visitante
                      </label>

                      <input
                        type="text"
                        value={
                          nuevoPartido.equipo_visitante
                        }
                        onChange={(
                          event
                        ) =>
                          setNuevoPartido(
                            (
                              actual
                            ) => ({
                              ...actual,
                              equipo_visitante:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                        placeholder="Barcelona"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      guardando
                    }
                  >
                    Añadir partido
                  </button>
                </form>
              </section>

              <section className="admin-card results-card">
                <div className="admin-card-header">
                  <div className="admin-card-icon">
                    🏁
                  </div>

                  <div>
                    <h3>
                      Resultados
                    </h3>

                    <p>
                      Introduce 1, X o 2
                      cuando finalice
                      cada partido.
                    </p>
                  </div>
                </div>

                {partidos.length ===
                0 ? (
                  <div className="admin-empty">
                    No hay partidos
                    todavía.
                  </div>
                ) : (
                  <div className="result-list">
                    {partidos.map(
                      (
                        partido
                      ) => (
                        <article
                          className="result-row"
                          key={
                            partido.id
                          }
                        >
                          <div>
                            <strong>
                              {
                                partido.equipo_local
                              }
                            </strong>

                            <span>
                              vs
                            </span>

                            <strong>
                              {
                                partido.equipo_visitante
                              }
                            </strong>
                          </div>

                          <div className="result-controls">
                            <div className="prediction-buttons compact">
                              {[
                                "1",
                                "X",
                                "2",
                              ].map(
                                (
                                  opcion
                                ) => (
                                  <button
                                    key={
                                      opcion
                                    }
                                    className={
                                      resultados[
                                        partido.id
                                      ] ===
                                      opcion
                                        ? "prediction-selected"
                                        : ""
                                    }
                                    onClick={() =>
                                      setResultados(
                                        (
                                          actual
                                        ) => ({
                                          ...actual,
                                          [partido.id]:
                                            opcion,
                                        })
                                      )
                                    }
                                  >
                                    {
                                      opcion
                                    }
                                  </button>
                                )
                              )}
                            </div>

                            <button
                              className="small-button"
                              onClick={() =>
                                guardarResultado(
                                  partido.id
                                )
                              }
                              disabled={
                                guardando
                              }
                            >
                              Guardar
                            </button>
                          </div>
                        </article>
                      )
                    )}
                  </div>
                )}
              </section>
            </section>
          )}
      </section>
    </main>
  );
}

export default App;
