// Icons the icon package (lucide-react, the prototype's) does not have, drawn as inline SVG in its style.
// Every other icon comes from lucide-react. Each is decorative: the button or text next to it carries
// the name for screen readers.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, className = "size-4", ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Not sent to the connected calendar yet: a crossed-out arrow up. */
export const NotSentIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20V8M7.5 12.5 12 8l4.5 4.5M4 4l16 16" />
  </Icon>
);
