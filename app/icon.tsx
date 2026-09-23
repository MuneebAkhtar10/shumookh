import { ImageResponse } from 'next/og';
import { ShumookhMark } from './shumookh-mark';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <ShumookhMark size={28} />
      </div>
    ),
    { ...size }
  );
}
