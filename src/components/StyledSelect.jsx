// The one dropdown for the whole app. A skinned NATIVE <select> — keyboard
// navigation, screen readers, and mobile pickers keep working for free —
// wrapped so the design system controls the surface and chevron.
import React from "react";
import { ChevronDown } from "lucide-react";

export default function StyledSelect({ wrapClassName = "", wrapStyle, children, ...props }) {
  return (
    <span className={`sh-select ${wrapClassName}`} style={wrapStyle}>
      <select {...props}>{children}</select>
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  );
}
