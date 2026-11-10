export function Help() {
  return (
    <details className="help">
      <summary>Ayuda</summary>
      <ul>
        <li>Los archivos deben estar descargados en el dispositivo; uno que solo está en iCloud puede requerir internet.</li>
        <li>El audio se procesa en tu dispositivo; nada se sube a ningún servidor.</li>
        <li>
          Para instalarla en el iPhone: en Safari pulsa Compartir y luego “Añadir a pantalla de inicio”.
        </li>
        <li>La primera visita necesita conexión para preparar el uso sin internet.</li>
        <li>
          <a href="licenses/LGPL-3.0.txt">Licencias de terceros</a>
        </li>
      </ul>
    </details>
  );
}
