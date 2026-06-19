export default function FieldError({ id, message }) {
  if (!message) return null;
  return <div id={id} className="inp-hint" role="alert">{message}</div>;
}
