import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "reactive-dot-ribbon": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          background?: boolean;
          source?: string;
          hint?: string;
        },
        HTMLElement
      >;
    }
  }
}
