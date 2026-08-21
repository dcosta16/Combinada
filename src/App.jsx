import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(event) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setMessage("Usuario o contraseña incorrectos.");
    }

    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  if (session) {
    return (
      <main className="app">
        <section className="dashboard">
          <header className="topbar">
            <div>
              <span className="eyebrow">COMBINADA</span>
              <h1>La quiniela de los amigos</h1>
            </div>

            <button
              className="secondary-button"
              onClick={logout}
            >
              Salir
            </button>
          </header>

          <section className="welcome">
            <p className="eyebrow">BIENVENIDO</p>

            <h2>{session.user.email}</h2>

            <p>
              El acceso funciona correctamente. Ahora construiremos
              el panel de jugador.
            </p>
          </section>

          <section className="cards">
            <article className="menu-card">
              <span>⚽</span>
              <h3>Jornada actual</h3>
              <p>Ver partidos y realizar pronósticos.</p>
            </article>

            <article className="menu-card">
              <span>🏆</span>
              <h3>Clasificación</h3>
              <p>Consulta las jornadas ganadas y los aciertos.</p>
            </article>

            <article className="menu-card">
              <span>💰</span>
              <h3>Premios</h3>
              <p>Consulta los premios de todos los jugadores.</p>
            </article>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="login-card">
        <div className="logo">⚽</div>

        <p className="eyebrow">LA QUINIELA DE LOS AMIGOS</p>

        <h1>COMBINADA</h1>

        <p className="subtitle">
          Entra para hacer tus pronósticos.
        </p>

        <form onSubmit={login}>
          <label htmlFor="email">Usuario</label>

          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@email.com"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Contraseña</label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Contraseña"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            disabled={loading}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          {message && (
            <p className="error-message">
              {message}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

export default App;
