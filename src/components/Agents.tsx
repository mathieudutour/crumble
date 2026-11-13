import { useCallback, useEffect, useState } from "react";
import { useUi } from "./UiProvider";

interface Agent {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
}

const lastUsed = (agent: Agent) => {
  if (!agent.lastUsedAt) return "jamais utilisé";
  const days = Math.floor((Date.now() - Date.parse(agent.lastUsedAt)) / 86_400_000);
  return days < 1 ? "utilisé aujourd’hui" : days === 1 ? "utilisé hier" : `utilisé il y a ${days} jours`;
};

/**
 * Connects AI agents that run outside the browser, like Hermes, through the household's remote MCP endpoint. Each
 * agent gets its own token, shown once, which can be revoked without touching the household link.
 */
export function Agents({ householdKey }: { householdKey: string }) {
  const { copy, toast } = useUi();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [label, setLabel] = useState("Hermes");
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ label: string; token: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const base = `/api/households/${encodeURIComponent(householdKey)}/agents`;
  const endpoint = `${location.origin}/api/mcp`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(base);
      if (response.ok) setAgents((await response.json()) as Agent[]);
    } catch {
      // Offline: the list shows again once back online.
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const response = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
    }).catch(() => null);
    if (!response?.ok) return toast("Impossible de connecter l’agent : vérifie ta connexion");
    const agent = (await response.json()) as Agent & { token: string };
    setCreated({ label: agent.label, token: agent.token });
    setAdding(false);
    void load();
  };

  const revoke = async (id: string) => {
    const response = await fetch(`${base}/${id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) return toast("Impossible de révoquer : vérifie ta connexion");
    setRevoking(null);
    toast("Accès révoqué");
    void load();
  };

  const config = created
    ? `mcp_servers:\n  crumble:\n    url: "${endpoint}"\n    headers:\n      Authorization: "Bearer ${created.token}"`
    : "";

  return (
    <>
      <p className="note spaced-bottom">
        Un agent IA qui tourne hors du navigateur (comme Hermes) peut utiliser Crumble pour toi : planning, courses,
        recettes. Chaque agent a son propre accès, que tu peux révoquer.
      </p>

      {created && (
        <div className="agent-token">
          <p>
            <b>{created.label}</b> est prêt. Copie sa configuration maintenant : le jeton ne sera plus affiché.
          </p>
          <pre>{config}</pre>
          <div className="row">
            <button className="cta slim" onClick={() => copy(config)}>
              Copier la configuration
            </button>
            <button className="cta ghost slim" onClick={() => copy(created.token)}>
              Copier le jeton
            </button>
          </div>
          <p className="note">
            Pour Hermes, ajoute ces lignes à <code>~/.hermes/config.yaml</code>. Pour un autre agent : serveur MCP «
            HTTP », adresse <code>{endpoint}</code>, en-tête <code>Authorization: Bearer</code> suivi du jeton.
          </p>
          <button className="link-button" onClick={() => setCreated(null)}>
            C’est fait
          </button>
        </div>
      )}

      {agents?.map((agent) => (
        <div className="pick" key={agent.id}>
          <span className="thumb" aria-hidden="true">
            🤖
          </span>
          <span className="nm">
            {agent.label}
            <br />
            <span className="note">{lastUsed(agent)}</span>
          </span>
          <button
            className={`pill${revoking === agent.id ? " on" : ""}`}
            onClick={() => (revoking === agent.id ? revoke(agent.id) : setRevoking(agent.id))}
          >
            {revoking === agent.id ? "Sûr ?" : "Révoquer"}
          </button>
        </div>
      ))}

      {adding ? (
        <div className="habit-form">
          <input
            className="field"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Nom de l’agent"
            maxLength={40}
          />
          <button className="cta slim" onClick={create} disabled={!label.trim()}>
            Créer l’accès
          </button>
        </div>
      ) : (
        <button className="cta ghost" onClick={() => setAdding(true)}>
          🤖 Connecter un agent
        </button>
      )}
    </>
  );
}
