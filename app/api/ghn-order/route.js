// import { NextResponse } from 'next/server';

// const GHN_TOKEN   = process.env.GHN_TOKEN;
// const GHN_SHOP_ID = process.env.GHN_SHOP_ID;
// const GHN_URL = 'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create';

// export async function POST(req) {
//   try {
//     const body = await req.json();

//     const {
//       to_name,
//       to_phone,
//       to_address,
//       to_ward_code,
//       to_district_id,
//       weight,
//       length,
//       width,
//       height,
//       content,
//     } = body;

//     if (!to_name || !to_phone || !to_address || !to_ward_code || !to_district_id || !weight || !length || !width || !height) {
//       return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
//     }

//     const payload = {
//       payment_type_id: 1,
//       required_note:   'CHOTHUHANG',
//       from_name:        'EscrowMAD Shop',
//       from_phone:       '0399311499',
//       from_address:     '72 Hà Tiên',
//       from_ward_code:   '540202',
//       from_district_id: 2058,
//       to_name,
//       to_phone,
//       to_address,
//       to_ward_code:    String(to_ward_code),
//       to_district_id:  Number(to_district_id),
//       weight:          Number(weight),
//       length:          Number(length),
//       width:           Number(width),
//       height:          Number(height),
//       content:         content || '',
//       service_type_id: 2,
//       items: [
//         {
//           name:     content || 'Item',
//           quantity: 1,
//           weight:   Number(weight),
//         },
//       ],
//     };
//     const res = await fetch(GHN_URL, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Token':        GHN_TOKEN,
//         'ShopId':       String(GHN_SHOP_ID),
//       },
//       body: JSON.stringify(payload),
//     });

//     const raw = await res.json();
//     console.log('[GHN response]', JSON.stringify(raw, null, 2));

//     if (raw.code !== 200) {
//       return NextResponse.json({ error: raw.message || 'GHN error' }, { status: 400 });
//     }

//     return NextResponse.json({ order_code: raw.data.order_code });
//   } catch (err) {
//     return NextResponse.json({ error: err.message }, { status: 500 });
//   }
// }
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      to_name,
      to_phone,
      to_address,
      to_ward_code,
      to_district_id,
      weight,
      length,
      width,
      height,
      content,
    } = body;

    // Validate các trường bắt buộc
    if (!to_name || !to_phone || !to_address || !to_ward_code || !to_district_id || !weight || !length || !width || !height) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Không gọi API GHN thật nữa — trả về order_code giả để tránh tạo đơn thật
    const fakeOrderCode = `DEMO${Math.floor(Math.random() * 90000000 + 10000000)}`;

    return NextResponse.json({ order_code: fakeOrderCode });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}