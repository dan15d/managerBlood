import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** QR dibujado en el propio navegador (sin servicios externos), en blanco para que lo lea cualquier cámara. */
export function QrCode({ text, size = 200 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
  }, [text]);
  return (
    <div
      className="qr"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Código QR para unirse"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Enlace directo para unirse con el código ya puesto. */
export const joinUrl = (code: string) => `${location.origin}${import.meta.env.BASE_URL}#/unirse/${code}`;
