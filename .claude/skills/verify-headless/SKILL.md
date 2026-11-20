---
name: verify-headless
description: Chạy lại toàn bộ kiểm chứng headless (test + scenario thật qua CLI) và lưu bằng chứng vào docs/proof. Dùng sau khi sửa src/sim hoặc contract, và trước khi gắn tag phase.
---

1. `npm test` — phải xanh.
2. `npm run proof -- phase-N` — chạy CLI thật trên các ca (đầu vào ở `docs/proof/phase-N/cases/`), tạo `REPORT.md` + output `.jsonl`.
   Đọc cột "Chi tiết": số liệu phải chứng minh đúng điều cần chứng minh, không chỉ chữ "ĐẠT".
3. Mục nào "CHƯA ĐẠT": sửa code (không sửa output/test cho khớp). Nếu yêu cầu mới đổi luật, ghi lý do vào `docs/notes/`.
4. Commit bằng chứng cùng mã; chỉ gắn tag khi REPORT toàn ĐẠT hoặc ghi trung thực chỗ chưa đạt.
