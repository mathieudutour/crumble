import { stepParts } from "../lib/steps";

interface Props {
  step: string;
  /** Recipe multiplier; quantities are highlighted when it isn't 1. */
  factor: number;
  /** When set, durations become buttons that start a timer. */
  onTimer?: (seconds: number) => void;
}

export function StepText({ step, factor, onTimer }: Props) {
  return (
    <>
      {stepParts(step, factor).map((part, i) => {
        if (typeof part === "string") return part;
        if (part.kind === "quantity")
          return factor === 1 ? (
            part.text
          ) : (
            <strong key={i} className="scaled">
              {part.text}
            </strong>
          );
        return onTimer ? (
          <button key={i} className="timer-chip" onClick={() => onTimer(part.seconds)}>
            ⏱ {part.label}
          </button>
        ) : (
          part.label
        );
      })}
    </>
  );
}
