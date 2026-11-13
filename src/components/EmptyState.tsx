import type { ReactNode } from "react";

interface Props {
  icon: string;
  title: string;
  children?: ReactNode;
  /** Sits in the page flow instead of filling the swipe deck. */
  inline?: boolean;
}

export function EmptyState({ icon, title, children, inline }: Props) {
  return (
    <div className={`empty${inline ? " inline" : ""}`}>
      <div className="big" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
