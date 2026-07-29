import { redirect } from 'next/navigation';

// Go /admin thi truoc day ra 404 vi chi co /admin/login va /admin/disputes.
// Day thang ve danh sach dispute; chua dang nhap thi proxy.js lo tiep.
export default function AdminIndexPage() {
  redirect('/admin/disputes');
}
