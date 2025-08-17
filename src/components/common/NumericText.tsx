import React from "react";

type Props = {
  text: string | number | null | undefined;
  className?: string;
};

// Split on digit runs, including ordinals (1st, 2nd, 23rd, 44th) and simple separators like 230-15 or 12,345
const DIGIT_SPLIT = /(\d+(?:[.,-]\d+)*(?:st|nd|rd|th)?)/gi;

export default function NumericText({ text, className = "" }: Props) {
  if (text === null || text === undefined) return null;
  const str = String(text);
  const parts = str.split(DIGIT_SPLIT);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!part) return null;
        const hasDigit = /\d/.test(part);
        return hasDigit ? (
          <span key={i} className="num-font">{part}</span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        );
      })}
    </span>
  );
}
