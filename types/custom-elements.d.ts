import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "reactive-dot-ribbon": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        hint?: string;
        source?: string;
      };
    }
  }
}
