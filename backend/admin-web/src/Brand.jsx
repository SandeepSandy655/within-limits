import mark from "./assets/within-limits.svg";

// Matches the compass, colors, and wordmark used on the mobile sign-in screen.
export default function Brand() {
  return <span className="brand">
    <img className="brand-mark" src={mark} width="38" height="38" alt=""/>
    <span className="brand-name">Within Limits</span>
  </span>;
}
