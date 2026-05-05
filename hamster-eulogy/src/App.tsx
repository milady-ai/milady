import { useState } from "react";

type Tone = "heartfelt" | "humorous" | "poetic" | "dramatic";

const toneEmoji: Record<Tone, string> = {
  heartfelt: "\u2764\ufe0f",
  humorous: "\ud83d\ude04",
  poetic: "\u2728",
  dramatic: "\ud83c\udfad",
};

export function App() {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [personality, setPersonality] = useState("");
  const [favoriteActivity, setFavoriteActivity] = useState("");
  const [causeOfDeath, setCauseOfDeath] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [tone, setTone] = useState<Tone>("heartfelt");
  const [eulogy, setEulogy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setEulogy("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          age,
          personality,
          favoriteActivity,
          causeOfDeath,
          ownerName,
          tone,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate eulogy");
      }

      const data = await res.json();
      setEulogy(data.eulogy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerIcon}>{"\ud83d\udc39"}</div>
        <h1 style={styles.title}>Hamster Eulogy Generator</h1>
        <p style={styles.subtitle}>
          Honor your beloved companion with a dignified farewell
        </p>
      </header>

      <main style={styles.main}>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>
              Hamster's Name <span style={styles.required}>*</span>
            </label>
            <input
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sir Nibbles III"
              required
            />
          </div>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Age</label>
              <input
                style={styles.input}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g., 2 years"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Owner's Name</label>
              <input
                style={styles.input}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g., Sarah"
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Personality Traits</label>
            <input
              style={styles.input}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="e.g., adventurous, snuggly, escape artist"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Favorite Activity</label>
            <input
              style={styles.input}
              value={favoriteActivity}
              onChange={(e) => setFavoriteActivity(e.target.value)}
              placeholder="e.g., running on the wheel at 3 AM"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Cause of Death</label>
            <input
              style={styles.input}
              value={causeOfDeath}
              onChange={(e) => setCauseOfDeath(e.target.value)}
              placeholder="e.g., old age, peacefully in sleep"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Tone</label>
            <div style={styles.toneGrid}>
              {(
                ["heartfelt", "humorous", "poetic", "dramatic"] as Tone[]
              ).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  style={{
                    ...styles.toneButton,
                    ...(tone === t ? styles.toneButtonActive : {}),
                  }}
                >
                  <span style={styles.toneEmoji}>{toneEmoji[t]}</span>
                  <span style={styles.toneLabel}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            style={{
              ...styles.submitButton,
              ...(loading || !name.trim() ? styles.submitButtonDisabled : {}),
            }}
          >
            {loading ? "Composing eulogy..." : "Generate Eulogy"}
          </button>
        </form>

        {error && <div style={styles.error}>{error}</div>}

        {eulogy && (
          <div style={styles.eulogyContainer}>
            <div style={styles.eulogyHeader}>
              <span>{"\ud83d\udd6f\ufe0f"}</span>
              <span>In Loving Memory of {name}</span>
              <span>{"\ud83d\udd6f\ufe0f"}</span>
            </div>
            <div style={styles.eulogyText}>
              {eulogy.split("\n\n").map((p, i) => (
                <p key={i} style={styles.eulogyParagraph}>
                  {p}
                </p>
              ))}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(eulogy)}
              style={styles.copyButton}
            >
              Copy to Clipboard
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    color: "#e0e0e0",
    fontFamily: "'Inter', sans-serif",
    margin: 0,
    padding: 0,
  },
  header: {
    textAlign: "center",
    padding: "3rem 1rem 2rem",
  },
  headerIcon: {
    fontSize: "4rem",
    marginBottom: "0.5rem",
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: "2.5rem",
    fontWeight: 700,
    color: "#f5f5f5",
    margin: "0 0 0.5rem",
  },
  subtitle: {
    fontSize: "1.1rem",
    color: "#a0a0b0",
    margin: 0,
  },
  main: {
    maxWidth: "640px",
    margin: "0 auto",
    padding: "0 1.5rem 3rem",
  },
  form: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: "16px",
    padding: "2rem",
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    flex: 1,
  },
  row: {
    display: "flex",
    gap: "1rem",
  },
  label: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#c0c0d0",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  required: {
    color: "#e07070",
  },
  input: {
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.08)",
    color: "#f0f0f0",
    fontSize: "1rem",
    fontFamily: "'Inter', sans-serif",
    outline: "none",
    transition: "border-color 0.2s",
  },
  toneGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "0.5rem",
  },
  toneButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.75rem 0.5rem",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)",
    color: "#c0c0d0",
    cursor: "pointer",
    transition: "all 0.2s",
    fontFamily: "'Inter', sans-serif",
  },
  toneButtonActive: {
    background: "rgba(100,140,255,0.2)",
    borderColor: "#648cff",
    color: "#fff",
  },
  toneEmoji: {
    fontSize: "1.5rem",
  },
  toneLabel: {
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  submitButton: {
    padding: "0.9rem",
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #648cff, #8b5cf6)",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
    transition: "opacity 0.2s",
    marginTop: "0.5rem",
  },
  submitButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  error: {
    marginTop: "1rem",
    padding: "1rem",
    borderRadius: "8px",
    background: "rgba(224,100,100,0.15)",
    border: "1px solid rgba(224,100,100,0.3)",
    color: "#f0a0a0",
  },
  eulogyContainer: {
    marginTop: "2rem",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "16px",
    padding: "2rem",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  eulogyHeader: {
    textAlign: "center",
    fontFamily: "'Playfair Display', serif",
    fontSize: "1.3rem",
    color: "#f5f5f5",
    marginBottom: "1.5rem",
    display: "flex",
    justifyContent: "center",
    gap: "0.75rem",
  },
  eulogyText: {
    lineHeight: 1.8,
    color: "#d0d0e0",
  },
  eulogyParagraph: {
    marginBottom: "1rem",
    textIndent: "1.5em",
  },
  copyButton: {
    marginTop: "1rem",
    padding: "0.6rem 1.2rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "transparent",
    color: "#a0a0b0",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontFamily: "'Inter', sans-serif",
    display: "block",
    marginLeft: "auto",
    marginRight: "auto",
  },
};
