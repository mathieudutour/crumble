import type { ReactNode } from "react";
import { sceneImage, type Scene } from "../data/images";

interface Props {
  /** Illustration, with an emoji until it exists. */
  scene: Scene;
  icon: string;
  title: string;
  children?: ReactNode;
  /** Sits in the page flow instead of filling the swipe deck. */
  inline?: boolean;
}

export function EmptyState({ scene, icon, title, children, inline }: Props) {
  const src = sceneImage(scene);
  return (
    <div className={`empty${inline ? " inline" : ""}`}>
      {src ? (
        <img className="scene" src={src} alt="" decoding="async" />
      ) : (
        <div className="big" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2>{title}</h2>
      {children}
    </div>
  );
}
