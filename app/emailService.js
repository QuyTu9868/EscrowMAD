import emailjs from '@emailjs/browser';

const SERVICE_ID  = 'service_39kp2ww';
const TEMPLATE_ID = 'template_8yfn1sl';
const PUBLIC_KEY  = 'Kho211JqfMjbx6Q93';

/**
 * Gửi email thông báo sự kiện escrow
 * @param {string} toEmail     - Email người nhận
 * @param {string} recipientName - Tên hiển thị (e.g. "Seller", "Buyer")
 * @param {string} eventTitle  - Tiêu đề sự kiện
 * @param {string} eventMessage - Nội dung chi tiết
 * @param {string} itemDescription - Tên sản phẩm
 * @param {string} contractAddress - Địa chỉ contract
 * @param {string} amount      - Số tiền (e.g. "0.05 ETH")
 */
export async function sendEscrowEmail({
  toEmail,
  recipientName,
  eventTitle,
  eventMessage,
  itemDescription,
  contractAddress,
  amount,
}) {
  if (!toEmail) return; // Không có email thì bỏ qua, không báo lỗi

  try {
    console.log('[EmailJS] Sending to:', toEmail, 'title:', eventTitle);
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_email:         toEmail,
        recipient_name:   recipientName || 'User',
        event_title:      eventTitle,
        event_message:    eventMessage,
        item_description: itemDescription || '—',
        contract_address: contractAddress || '—',
        amount:           amount || '—',
      },
      PUBLIC_KEY
    );
  } catch (err) {
    // Lỗi gửi email không được làm crash app
    console.error('[EmailJS] Failed to send email:', err?.status, err?.text, JSON.stringify(err));
  }
}