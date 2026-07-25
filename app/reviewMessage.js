// Dùng chung giữa client (ký) và server (xác minh chữ ký) — PHẢI tạo ra
// đúng 1 chuỗi giống hệt nhau ở cả 2 phía, nếu không chữ ký sẽ không khớp.
export function buildReviewMessage({ dealAddress, reviewerAddress, revieweeAddress, rating, comment, timestamp }) {
  return [
    'EscrowMAD Review',
    `Deal: ${String(dealAddress).toLowerCase()}`,
    `Reviewer: ${String(reviewerAddress).toLowerCase()}`,
    `Reviewee: ${String(revieweeAddress).toLowerCase()}`,
    `Rating: ${rating}`,
    `Comment: ${comment ?? ''}`,
    `Timestamp: ${timestamp}`,
  ].join('\n');
}
