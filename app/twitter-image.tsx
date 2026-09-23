import { ImageResponse } from 'next/og';
import { ShumookhMark } from './shumookh-mark';

export const runtime = 'edge';
export const alt = 'Shumookh Property Management';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          border: '16px solid #23abb5',
        }}
      >
        <div style={{ display: 'flex', marginBottom: '48px' }}>
          <ShumookhMark size={160} />
        </div>
        <div
          style={{
            fontSize: '84px',
            fontWeight: 'bold',
            color: '#0f172a',
            fontFamily: 'sans-serif',
          }}
        >
          Shumookh
        </div>
        <div
          style={{
            fontSize: '36px',
            color: '#64748b',
            marginTop: '24px',
            fontFamily: 'sans-serif',
          }}
        >
          Report, assign and track maintenance across your properties.
        </div>
      </div>
    ),
    { ...size }
  );
}
