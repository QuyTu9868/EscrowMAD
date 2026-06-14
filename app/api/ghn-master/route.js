import { NextResponse } from 'next/server';

const GHN_TOKEN = process.env.GHN_TOKEN;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // province | district | ward
  const districtId = searchParams.get('district_id');
  const provinceId = searchParams.get('province_id');

  let url = '';
  let method = 'GET';
  let body = undefined;

  if (type === 'province') {
    url = 'https://online-gateway.ghn.vn/shiip/public-api/master-data/province';
  } else if (type === 'district') {
    url = 'https://online-gateway.ghn.vn/shiip/public-api/master-data/district';
    method = 'POST';
    body = JSON.stringify({ province_id: Number(provinceId) });
  } else if (type === 'ward') {
    url = `https://online-gateway.ghn.vn/shiip/public-api/master-data/ward?district_id=${districtId}`;
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const res = await fetch(url, {
    method,
    headers: { 'Token': GHN_TOKEN, 'Content-Type': 'application/json' },
    ...(body ? { body } : {}),
  });

  const data = await res.json();
  return NextResponse.json(data);
}