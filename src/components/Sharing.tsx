import { useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { sceneImage } from "../data/images";
import { useStore } from "../store/StoreProvider";
import type { SyncStatus } from "../store/store";
import { InstallHint, useSuggestInstall } from "./InstallHint";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

export function statusLabel(status: SyncStatus): string {
  if (status.mode === "solo") return "Sur ce téléphone seulement";
  if (!status.joined) return "Connexion au foyer…";
  if (status.connection === "online") return status.pending ? "Envoi…" : "Synchronisé";
  if (status.connection === "connecting") return "Connexion…";
  return status.pending
    ? `Hors ligne · ${status.pending} changement${status.pending > 1 ? "s" : ""} en attente`
    : "Hors ligne";
}

/** Create a shared household, or invite to and leave the current one. Lives in the « Foyer » tab. */
export function Sharing() {
  const { status, household } = useStore();
  const { toast, copy } = useUi();
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const suggestInstall = useSuggestInstall();
  const link = status.mode === "household" ? household.inviteLink() : undefined;
  const qr = useMemo(
    () => (link ? renderSVG(link, { border: 1, blackColor: "#2b2420", whiteColor: "#ffffff" }) : ""),
    [link],
  );

  if (status.mode === "solo") {
    const art = sceneImage("household");
    return (
      <>
        {art && <img className="share-art" src={art} alt="" decoding="async" />}
        <p className="note spaced-bottom">
          Partage ton foyer : l’autre adulte voit le même planning, les mêmes plats et coche la même liste de courses,
          en direct. Pas de compte, un lien suffit.
        </p>
        <button
          className="cta"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await household.createHousehold();
              toast("Foyer partagé créé");
              suggestInstall();
            } catch {
              toast("Impossible de créer le foyer : vérifie ta connexion");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Création…" : "👥 Partager avec mon foyer"}
        </button>
      </>
    );
  }

  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Crumble",
          text: "Rejoins notre foyer sur Crumble pour partager le planning et les courses :",
          url: link,
        });
        return;
      } catch {
        // Cancelled, or not allowed: fall back to copying.
      }
    }
    await copy(link);
  };

  return (
    <>
      <InstallHint />
      <p className={`sync-status ${status.connection}${status.joined ? "" : " joining"}`} role="status">
        <i aria-hidden="true" /> {statusLabel(status)}
      </p>
      {link && (
        <div className="invite">
          <div
            className="qr"
            role="img"
            aria-label="QR code du lien d’invitation"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div className="invite-text">
            <p className="note">Pour inviter l’autre adulte, fais-lui scanner ce code ou envoie-lui le lien.</p>
            <button className="cta slim" onClick={share}>
              Envoyer le lien
            </button>
          </div>
        </div>
      )}
      <p className="note spaced">
        Toute personne qui a ce lien rejoint le foyer : ne l’envoie qu’aux personnes de la maison.
      </p>
      <button
        className={`cta ghost${confirmLeave ? " danger" : ""}`}
        onClick={() => {
          if (!confirmLeave) return setConfirmLeave(true);
          household.leave();
          setConfirmLeave(false);
          toast("Tu as quitté le foyer. Ce téléphone garde une copie.");
        }}
        onBlur={() => setConfirmLeave(false)}
      >
        {confirmLeave ? "Sûr ? Ce téléphone ne sera plus synchronisé" : "Quitter le foyer"}
      </button>
    </>
  );
}

/** Asked when opening an invitation link. */
export function JoinSheet({ joinKey, onDone }: { joinKey: string; onDone: (joined: boolean) => void }) {
  const { status, household } = useStore();
  const alreadyShared = status.mode === "household";
  return (
    <Sheet onClose={() => onDone(false)} labelledBy="join-title">
      <div className="in">
        <SheetHeader id="join-title" title="Rejoindre un foyer" onClose={() => onDone(false)} />
        {sceneImage("household") && <img className="share-art" src={sceneImage("household")} alt="" decoding="async" />}
        <p>Tu vas partager le planning, les plats et la liste de courses de ce foyer, en direct.</p>
        <p className="note spaced">
          {alreadyShared
            ? "Tu quitteras ton foyer actuel, et ce qui est enregistré sur ce téléphone sera remplacé par le foyer que tu rejoins."
            : "Ce qui est enregistré sur ce téléphone sera remplacé par les plats, plannings et réglages du foyer."}
        </p>
        <button
          className="cta"
          onClick={() => {
            household.join(joinKey);
            onDone(true);
          }}
        >
          Rejoindre le foyer
        </button>
        <button className="cta ghost" onClick={() => onDone(false)}>
          Pas maintenant
        </button>
      </div>
    </Sheet>
  );
}
