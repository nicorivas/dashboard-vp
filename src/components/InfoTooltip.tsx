"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";

/** Trigger (ⓘ por default, o cualquier otro ícono/flecha) con un globito
 *  flotante al pasar el mouse/foco — mismo estilo que el tooltip de los
 *  funnels (tarjeta blanca con borde y sombra), en vez del tooltip nativo
 *  del navegador. Usa posición `fixed` calculada desde el trigger para no
 *  quedar recortado por el `overflow-x-auto` de las tablas. */
export function InfoTooltip({
  text,
  children,
  className = "ml-0.5 cursor-help text-gray-400",
}: {
  text: string;
  children?: ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        tabIndex={0}
        aria-label="Más información"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={className}
      >
        {children ?? "ⓘ"}
      </button>
      {pos && (
        <span
          className="fixed z-50 w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2.5 text-left text-[11px] font-normal normal-case leading-snug text-gray-600 shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </span>
      )}
    </>
  );
}
