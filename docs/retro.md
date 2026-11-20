# Retro — Đảo Đèn Lồng (4 phase)

## Evaluation từng phase
| Phase | Kết quả | Hỏng phase trước? | Điều cần chỉnh (đã làm) |
|---|---|---|---|
| 1 PRD-0 | Lõi sim tất định + CLI headless + game một Đêm; 21 test, 7 ca proof | — | Tách sim khỏi render ngay từ đầu (về sau trả giá rất rẻ) |
| 2 Ba hòn đảo | Số chuẩn, 3 bản đồ, Lướt/rơi/bục/Gió Lạc/Bùa/gió/tạm dừng, luồng 3 Đêm; 44 test, 18 ca | Không (test Phase 1 đổi số, hành vi giữ) | Ca proof "vùng an toàn" từng đạt vì lý do sai → thêm khẳng định chứng minh điều kiện đã được thử |
| 3 Đèn cạn dầu | Đổi luật cốt lõi (nhiên liệu, hút dầu, thắng ở bình minh, sức chứa, điểm, mù màu); 63 test, 26 ca | Đúng 7 test bị ticket thay, liệt kê trong `docs/notes/phase-3.md` | ADR + changelog breaking; chạy test ngay khi đổi luật để biết chính xác cái gì vỡ |
| 4 Phát hành | Benchmark, soak, bảng xếp hạng, đổi phím, tiếp cận, đóng gói; 78 test, 29 ca | Không | Benchmark lần đầu trượt ngưỡng → tối ưu bằng số đo (xem notes) |

Số liệu cuối: 78 test tự động, 29 ca proof chạy bằng CLI thật, 4 tag, bench avg 698 fps / p1-low 166 fps (máy tác giả), soak 0 lỗi.

## Điều gì hiệu quả khi làm với AI
- **Số liệu và luật ở một nơi** (`game.contract.json` đọc thẳng bởi sim): khai báo và hành vi không thể lệch nhau; mỗi phase chỉ sửa một file số.
- **Test viết theo từng dòng của ticket** trước/cùng lúc với code. Khi Ticket-03 thay luật, chạy test là biết ngay đúng 7 chỗ vỡ — không phải đoán.
- **Proof bằng CLI thật + cột "Chi tiết"** in số liệu chứng minh: chính cột này lộ ra ca vùng an toàn "đạt" với khoảng cách 24.7 m.
- **Script thay thế có kiểm tra mỏ neo**: khi mỏ neo sai, script dừng ồn ào thay vì vá trượt âm thầm.
- **Ảnh chụp thật** bắt được lỗi mà test không bắt: thân Bóng Mực sai màu, ô sức chứa bị che, thanh dầu chỉ hiện nền.
- Đo trước khi tối ưu: `renderBench` (render đồng bộ) và `frame_ms_max` tách được "cảnh nặng" khỏi "Chrome giới hạn khung hình nền".

## Điều gì không hiệu quả
- Tin vào cảm giác "chắc đủ nhanh": benchmark đầu tiên trượt (avg 46 / p1-low 10). Lẽ ra phải đo cảnh benchmark ngay khi viết cảnh, không đợi tới cuối.
- Đoán toàn bộ hình học test trong đầu: hơn chục test sai ở Phase 2–3 (vị trí ngoài rìa đảo, kiểm ở tick sai, dữ liệu y bị bỏ qua). Tính tay trước sẽ rẻ hơn lặp sửa.
- Heredoc dài trong shell: lỗi escape làm mất vài lượt; dùng công cụ ghi file cho nội dung dài.
- Kiểm chứng âm thanh và cảm giác chơi: không có cách tự động; vẫn là "—" trong spec.

## Những lần AI sai và cách phát hiện
| Lần | Sai ở đâu | Phát hiện bằng | Phòng lặp lại |
|---|---|---|---|
| P1 | Choáng ngắn 1 tick (trừ ngay trong bước xung) | Test "stun wears off" | Test đếm tick chính xác |
| P2 | Test an toàn "đạt vì lý do sai" | Proof in khoảng cách 24.7 m | AGENTS.md: mỗi test "X không xảy ra" phải chứng minh X đã được thử |
| P2 | Đèn điểm thật cho 7 đèn → cảnh nặng, biên dịch shader lại | `renderBench` | Dùng sprite/halo thay đèn điểm |
| P2 | Tưởng game chậm (1 FPS) | So sánh với đo đồng bộ | AGENTS.md: Chrome giới hạn rAF nền |
| P3 | Script patch dở dang vì mỏ neo sai | Script dừng với lỗi rõ | Giữ kiểu script có kiểm tra; dọn script sau khi chạy |
| P3 | Thanh dầu chỉ hiện nền (xoay từng mảng thay vì nhóm) | Ảnh chụp | AGENTS.md: billboard xoay cả Group |
| P4 | Benchmark trượt ngưỡng | Chạy `bench` thật | `frame_ms_max` trong bench.json; không sao chép/sắp xếp mỗi tick |
| P4 | Bảng màu bị phá (thân Bóng Mực phát sáng) | Ảnh chụp | Kiểm màu hằng số trong `PAL` |
| P4 | Lệnh `taskkill /IM node.exe` quá rộng | Bị chặn bởi quy tắc an toàn | Chỉ dừng đúng tiến trình theo cổng |

## Harness nào giúp nhiều nhất
1. **`AGENTS.md`** có mục "Lỗi AI đã gặp" được cập nhật mỗi phase — chỗ duy nhất ghi lại bài học để lần sau không lặp.
2. **Skill `verify-headless`** (test + proof, đọc cột Chi tiết) — quy trình lặp lại mỗi phase.
3. **Hook Stop** chạy `npm test`, chặn kết thúc khi đỏ: được cấu hình trong `.claude/settings.json`; **chưa có bằng chứng nó đã chặn lần nào**, nên chưa thể nói nó giúp bao nhiêu.
4. CI GitHub Actions chạy build + test + proof (chưa có lần chạy nào vì repo chưa được push trong phiên này).

## Token / chi phí AI
**Chủ repo điền từ `/cost` hoặc bảng điều khiển** — repo không có số đo thật và không ghi số ước tính bịa.
| Phase | Token vào | Token ra | Chi phí ước tính |
|---|---|---|---|
| 1 | _điền_ | _điền_ | _điền_ |
| 2 | _điền_ | _điền_ | _điền_ |
| 3 | _điền_ | _điền_ | _điền_ |
| 4 | _điền_ | _điền_ | _điền_ |

Cách đã tiết kiệm: không dùng subagent; sim tách khỏi render nên test rẻ và nhanh (không cần chạy game để kiểm luật); AGENTS.md ngắn; script thay thế thay vì viết lại cả file; chụp ảnh chỉ khi cần; đo bằng số thay vì chạy thử đi thử lại.

## Nếu làm lại
- Đặt bộ benchmark cảnh chuẩn ngay Phase 2 (khi có thực thể đầu tiên), chạy mỗi phase thay vì chờ Phase 4.
- Viết cảnh render theo instancing/dùng chung vật liệu từ đầu.
- Viết bộ dựng scenario có hàm trợ giúp hình học (khoảng cách tới rìa đảo, tick đổi trạng thái) để test khỏi tính tay.
- Tự động hóa kiểm tra bảng màu (so hex của vật liệu với `PAL`) và đo cỡ chữ.
- Quay video và tạo Release sớm hơn để không dồn cuối giờ.
