# Harbor RP02 — sửa gameplay và ba khu vực Blender

> **Trạng thái repository (2026-09-17):** mã nguồn, GLB và tài liệu RP02 đã
> được hợp nhất vào `main` trong snapshot `d796c8f`. Các câu “chưa commit/push”
> bên dưới ghi lại trạng thái tại thời điểm kiểm tra RP02; không còn mô tả
> working tree hiện tại. Trạng thái deploy online chưa được xác minh trong tài liệu này.

Ngày kiểm tra: 09/09/2026. Đây là bản sửa trên game Three.js hiện tại, không phải
migration sang Unreal và không dùng ảnh concept thay cho asset trong game.

## Thay đổi đã tích hợp

- **Rơi xuống nước:** mặt phẳng giữ người bơi từng bị coi là mặt đất, nên giữ
  Space liên tục làm nhân vật bật lên và reset thời gian chết đuối. Hunter và Prop
  không còn nhảy từ mặt nước. Server vẫn quyết định chết sau 3 giây ngập liên tục;
  lên bờ hoặc đứng trên boong tàu khô có collider vẫn an toàn. Không tự thêm sát
  thương rơi từ độ cao.
- **Tọa độ Hunter:** mạng và kiểm tra nước dùng cao độ chân vật lý, không lấy vị
  trí camera trừ hằng số 1,6 m. Ngồi xuống không còn báo nhầm chân đang dưới nước.
- **Trạm Hunter:** thay nhà đen hở mái bằng Harbor Response Station, có mái thật,
  kính/khung, tủ chìm, biển chữ nổi và vạch triển khai. Cửa cuốn mở trong 0,45 giây
  theo logic release hiện có. Sàn hoàn thiện cao 0,14 m có collider khớp.
  Ba collider hòm/ghế cũ được bỏ khi asset trạm mới hoạt động; fallback giữ nguyên.
- **Chòi vé cạnh đu quay:** dựng lại bằng Blender; kính/quầy/tường/mái đều có
  collider. Cửa hông rộng 1,45 m đi được, đáp được lên mái và không nhảy xuyên
  mặt dưới mái. High và Low có cùng bề mặt gameplay. Chi tiết trong
  [ticket-office.md](ticket-office.md).
- **Bãi trống ven cảng:** thành khu bảo trì cứu hộ với xuồng RIB đặt trên giá,
  mái xưởng, bàn dụng cụ, tủ, phao, rãnh thoát nước và tháp quan sát mới. Giữ đường
  đi x=43–49 m và thang leo tháp. Bỏ ba cây/collider cũ, kiosk phát sáng cũ và các
  chi tiết rời trong đúng vùng thay thế, gồm hòm trang trí cũ tại (52,18) bị lún
  vào sàn mới. Sàn cao 0,24 m che lớp đường/vạch cũ;
  collider sàn được nâng cùng hình học.
- **Vân loang trên mái/sàn:** A/B trong game xác nhận lỗi tự đổ bóng (shadow
  acne), không phải normal map. Điều chỉnh bias của đèn nắng từ -0,0004/0,02
  sang -0,001/0,08; vẫn giữ bóng công trình và bóng tháp, không tắt shadow.
- **Low che góc nhìn chòi vé:** truy ray xác định hộp nhà kính cũ ở (-25,38)
  vẫn nằm trong batch kim loại Low dùng chung, dù khu vườn đã có asset thay thế.
  Dọn riêng hình học nhà kính cũ trong garden override, không xóa cả batch và
  không mở rộng phạm vi xóa sang các công trình khác.

## Nguồn và bản chạy trong game

| Khu | Nguồn Blender | Asset production | Chi phí asset High / Low |
| --- | --- | --- | --- |
| Trạm Hunter | `art-source/harbor-v2/response-station/response-station.blend` | `client/public/assets/maps/harbor-v2/zones/response-station.glb` | 7 / 7 draws; 13.739 / 9.955 tam giác |
| Khu cứu hộ | `art-source/harbor-v2/rescue-quay/rescue-quay.blend` | `client/public/assets/maps/harbor-v2/zones/rescue-quay.glb` | 9 / 9 draws; 12.548 / 5.860 tam giác |
| Cả khu đu quay, bao gồm chòi vé | `art-source/harbor-v2/ferris-harbor/ferris-harbor-ticket-repair.blend` | `client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb` | 90 / 26 draws; 36.388 / 3.460 tam giác |

Các con số là chi phí riêng GLB, không phải tổng draw calls của khung hình.
Hai asset mới có tổng dung lượng khoảng 3 MB. GLB được kiểm tra trước khi đưa
vào đường dẫn production; các bản cũ được giữ trong `_staging/pre-rp02` và
`_staging/ticket-repair`. Nguồn RL01 không bị ghi đè.

Ảnh native Blender 3840×2160:

- [Trạm Hunter mở cửa](blender-station-open.png)
- [Nội thất trạm](blender-station-interior.png)
- [Khu cứu hộ](blender-rescue-quay.png)
- [Xưởng xuồng cứu hộ](blender-rescue-workshop.png)
- [Chòi vé](ticket-office-front.png), [cửa hông](ticket-office-entrance.png)

Đây là ảnh render từ mesh Blender thật. Ánh sáng trong browser được cấu hình
riêng; ảnh render 4K không đồng nghĩa game đạt 4K/60 FPS.

## Kiểm tra

Các regression tests sử dụng GLB production, controller Hunter thật và bề mặt
va chạm High/Low. Kiểm tra nước kết nối controller → AntiCheat → GameRoom, gồm
giữ Space, đứng/ngồi trên boong khô và ngừng gửi input khi đang chìm.

Build shared/server/client thành công; ESLint không có error (repository vẫn có
cảnh báo tồn tại). 13 test server liên quan nước và toàn bộ 189 test client pass
sau sửa. Không tuyên bố toàn bộ server suite xanh: các lỗi baseline
ngoài phạm vi RP02 được ghi trong lượt RL01 trước.

Browser chạy riêng từng backend/quality trên Chrome headless, viewport 1600×900,
DPR 1, âm thanh tắt. High đo 5 góc ×4 giây và bắn vào biển/tường 2×12 giây;
Low đo 3 góc ×4 giây. Cả bốn cấu hình đều khoảng 60 FPS, p95 16,8 ms, không có
frame trên 50 ms trong các mẫu đo. Không có lỗi renderer/application.

| Backend | Chất lượng | Gate thực tế | Bắn thử | Kiểm tra nước thật |
| --- | --- | --- | --- | --- |
| WebGL2 | High | LOD0, đóng/mở pass | 82 phát; mark tối đa 0,13 m | Pass |
| WebGPU | High | LOD0, đóng/mở pass | 82 phát; mark tối đa 0,13 m | Pass |
| WebGL2 | Low | LOD1, đóng/mở pass | Không đo lại | Test controller/server dùng chung |
| WebGPU | Low | LOD1, đóng/mở pass | Không đo lại | Test controller/server dùng chung |

Ở kiểm tra nước browser, chỉ đặt vị trí controller rồi để trọng lực, input Space,
mạng và AntiCheat chạy bình thường. Cả hai backend nhận đúng một sự kiện
`playerDrowned`, health=0, client/server chuyển sang spectator. Headless không
cho pointer lock nên dùng đường input mobile công khai; không sửa state server.
Do đặt lại vị trí xa điểm bắn, AntiCheat có độ trễ chấp nhận vị trí; báo cáo lưu
riêng thời điểm vào nước ở client và thời điểm quan sát được ở server. Test bằng
clock giả kiểm chứng riêng ngưỡng 3000 ms.

Các JSON chi tiết nằm trong `runtime/rp02-{webgl2,webgpu}-{high,low}-report.json`.
Sau lần đo High bắn/nước, có thêm hai cleanup tĩnh: hòm trang trí x52/z18 và hộp
nhà kính Low cũ. `rp02-final-high-report.json` cùng hai báo cáo Low cập nhật là
lượt xác minh cuối sau cleanup; logic vũ khí, gate và nước không thay đổi.
Đây là smoke/performance sample local, không phải benchmark 4K, mobile thật hoặc
đảm bảo mọi góc/mọi cấu hình máy đều 60 FPS.

Ảnh game sau cập nhật:

- [Trạm đóng cửa](runtime/rp02-webgl2-high-station-closed.png), [mở cửa](runtime/rp02-webgl2-high-station-open.png)
- [Nội thất trạm](runtime/rp02-webgpu-high-responseStationEntry.png)
- [Khu cứu hộ](runtime/rp02-final-high-rescueQuay.png)
- [Chòi vé](runtime/rp02-webgl2-high-ferrisTicket.png)
- [Server xác nhận chết đuối](runtime/rp02-webgpu-high-water-check.png)

## Rebuild

Chạy từ root repository. Blender chạy nền, không sửa scene đang mở trong GUI.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/zones/build_rescue_quay.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/zones/build_response_station.py
/Applications/Blender.app/Contents/MacOS/Blender --background art-source/harbor-v2/response-station/response-station.blend --python-exit-code 1 --python tools/harbor-v2/export_zone_scene.py -- --output art-source/harbor-v2/_staging/response-station/response-station-candidate.glb
node tools/harbor-v2/validate_response_station.mjs
node tools/harbor-v2/promote_rescue_assets.mjs rescue-quay response-station
npm run test -w client
npm run test -w server -- --run tests/systems/WaterMovementIntegration.test.ts tests/systems/EnvironmentalHazards.test.ts
npm run build
npm run lint
```

Hướng dẫn rebuild chòi vé nằm trong `ticket-office.md`; phải dùng nguồn sửa RP02,
không xuất đè từ scene Ferris cũ. Muốn rollback cần hoàn nguyên cả GLB và override
liên quan, không chỉ thay mesh để tránh collider cũ/mới lệch nhau.

Kiểm tra browser tạo phòng riêng, không vào phòng người dùng:

```sh
node tools/harbor-v2/capture_runtime_review.mjs --out-dir docs/v2/harbor/repair-review/runtime --prefix rp02-webgl2-high --renderer webgl2 --quality high --presets responseStation,responseStationEntry,rescueQuay,rescueWorkshop,ferrisTicket --repair-check true --shoot true --port 9333
```

Sau khi cập nhật, tải lại client và tạo/vào lại phòng để nhận đầy đủ state và
asset mới. Chưa commit, push hoặc deploy từ lượt sửa này.
