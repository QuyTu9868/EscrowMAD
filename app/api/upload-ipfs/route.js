import { NextResponse } from 'next/server';

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const pinataForm = new FormData();
  pinataForm.append('file', file);

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
    body: pinataForm,
  });

  if (!res.ok) return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  const data = await res.json();
  return NextResponse.json({ hash: data.IpfsHash });
}