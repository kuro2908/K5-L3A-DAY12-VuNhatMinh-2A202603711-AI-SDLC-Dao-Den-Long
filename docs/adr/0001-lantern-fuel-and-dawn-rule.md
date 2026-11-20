# ADR-0001 — Nhiên liệu đèn và luật "giữ sáng tới bình minh" (Ticket-03)

Trạng thái: chấp nhận (Phase 3). Thay thế: luật Phase 1–2 "đèn sáng là xong" và "thắng ngay khi tất cả đèn sáng".

## Bối cảnh
Người chơi giỏi thắp hết đèn trong ~2 phút rồi game kết thúc. Ticket-03 muốn đèn tắt được và mục tiêu là giữ đảo sáng tới bình minh.

## Quyết định
**1. Mô hình trạng thái đèn.** Trước: `unlit → lit` (một chiều, `deposited` 0..10, `lit`). Sau: thêm `fuel`, `everLit`, `relit`:

```
unlit(deposited<cost) --nạp đủ cost--> lit(fuel=100) --fuel<=0--> unlit(deposited=0, everLit=true)
   cost = 10 nếu chưa từng sáng, 5 nếu everLit          lit --châm dầu--> lit(fuel↑ tối đa 100)
```
- `fuel` lưu bằng **số nguyên đơn vị 1/60** (`fuelU`): hao 1.0/s = trừ 1 đơn vị mỗi tick, bị hút 5/s = trừ 5 đơn vị mỗi tick. Không có sai số số thực tích lũy; chỉ làm tròn 1 chữ số thập phân khi xuất (snapshot/event).
- Hao dầu và hút dầu nằm ở **bước 2** của tick; ngay sau đó đèn có `fuel ≤ 0` tắt (`lantern_out`). Vì hao diễn ra trước tương tác (bước 5), đèn vừa đầy 100 chỉ "đầy hoàn toàn" ở đúng tick được châm; từ tick sau luôn là 99.98 và vẫn nhận được dầu (đúng công thức `ceil((100−fuel)/10)` ≥ 1). Hệ quả đã chấp nhận: bấm E cạnh đèn gần đầy tốn 1 đom đóm.
- Vùng an toàn thành thuộc tính dẫn xuất: `safeOn(l) = l.lit && fuel ≥ 30` (hàm duy nhất, mọi nơi gọi lại hàm này để không lệch).

**2. Bóng Mực hút dầu.** Thêm trạng thái `drain` vào máy trạng thái (`spawning, wander, chase, recoil, stunned, drain`). Chỉ `wander` chọn đèn yếu; tie-break theo id nhỏ; không có đèn yếu thì như cũ (đèn tắt gần nhất). Thoát `drain` theo đúng bốn điều kiện trong ticket; châm dầu vượt ngưỡng 30 làm các bóng trong vùng bị đẩy ra ≤ 30 tick không sát thương (dùng chung cơ chế `expelInside` với lúc thắp đèn).

**3. Luật thắng.** Bỏ nhánh "tất cả đèn sáng → thắng". `judge()` chỉ quyết định ở bước 11: hết Lửa → `no_flames` (luôn trước); chưa tới giờ → tiếp tục; tới giờ → thắng `dawn_survived` nếu số đèn sáng ≥ `ceil(0.6·n)`, ngược lại thua `dawn`. Điểm thắng = Σ(50+⌊fuel⌋) mỗi đèn sáng + 50×Lửa; bỏ thưởng thời gian.

**4. Sức chứa** = `min(20, 10 + 2·successfulLights)`, `successfulLights` là bộ đếm của `Sim` nên tự reset mỗi Đêm (mỗi Đêm là một `Sim` mới) và đèn đặt bằng scenario không tăng bộ đếm.

## Phương án đã bỏ
- Lưu `fuel` kiểu số thực: sai số 1/60 tích lũy và test so sánh bằng cho giá trị 30 sẽ không ổn định.
- Cho `deposited` đóng vai trò dầu: không biểu diễn được `everLit` và chi phí thắp lại khác nhau.

## Hệ quả cho test và tài liệu
Xem `CHANGELOG.md` (breaking changes) và `docs/notes/phase-3.md` (bảng test cũ bị thay, kèm lý do).
