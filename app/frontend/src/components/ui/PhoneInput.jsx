import { normalizePhoneInput } from "../../lib/format";

export default function PhoneInput({ value, onChange, className = "", ...rest }) {
  return (
    <input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={(event) => onChange?.(normalizePhoneInput(event.target.value) || "+998")}
      className={className}
      {...rest}
    />
  );
}
