import { useStore } from "../store/StoreProvider";
import { counts, required } from "../store/selectors";

function CountChip({ icon, label, have, need }: { icon: string; label: string; have: number; need: number }) {
  const progress = need ? Math.min(100, (have / need) * 100) : 100;
  return (
    <div className="chip">
      {icon} {label}{" "}
      <b>
        {Math.min(have, need)}/{need}
      </b>
      {have > need && <span className="extra"> (+{have - need})</span>}
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={need}
        aria-valuenow={Math.min(have, need)}
        aria-label={label}
      >
        <i style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

/** Progress towards the dinners and lunches needed to build a plan. */
export function Counts() {
  const { state, catalogue } = useStore();
  const have = counts(state, catalogue);
  const need = required(state, catalogue);
  return (
    <div className="counts">
      <CountChip icon="🍽" label="Dîners" have={have.dinners} need={need.dinners} />
      <CountChip icon="🥧" label="Midis" have={have.lunches} need={need.lunches} />
    </div>
  );
}
