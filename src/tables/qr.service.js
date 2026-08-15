import QRCode from 'qrcode';

export function createQrService() {
  return {
    png: (value) =>
      QRCode.toBuffer(value, { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' }),
    svg: (value) =>
      QRCode.toString(value, { type: 'svg', width: 512, margin: 2, errorCorrectionLevel: 'M' }),
  };
}
