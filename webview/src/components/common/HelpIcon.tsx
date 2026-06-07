import { Tooltip } from "./Tooltip";

interface Props {
  /** Already-translated help text. */
  text: string;
  /** "?" (default) or "i". */
  glyph?: "?" | "i";
}

/** A small "?" / "i" marker that reveals a help tooltip on hover/focus. */
export function HelpIcon({ text, glyph = "?" }: Props) {
  return (
    <Tooltip text={text}>
      <span className="bb-help" tabIndex={0} role="img" aria-label={text}>
        {glyph}
      </span>
    </Tooltip>
  );
}
