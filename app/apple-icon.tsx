import { ImageResponse } from 'next/og';
import { ShumookhMark } from './shumookh-mark';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          borderRadius: '40px',
        }}
      >
        <ShumookhMark size={140} />
      </div>
    ),
    { ...size }
  );
}
