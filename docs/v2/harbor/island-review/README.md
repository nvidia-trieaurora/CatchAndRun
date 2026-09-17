# Harbor RP03 — cửa hàng, mặt đảo, tàu và nước

Đây là thay đổi **code + GLB dùng trong game**, không chỉ là ảnh concept. Không chuyển engine, không dùng HY-World và không khởi chạy GPU cloud.

## Những phần đã thay đổi

- Harbor Market: bản Blender mới có bảng hiệu, mái hiên được đỡ, lam gỗ, kính và nội thất; sửa các lối vào, cửa phòng nhân viên, trần và hatch trên High/Low. [Nguồn và ảnh Blender 4K](../repair-review/market-rp03/README.md).
- Mặt đảo: sửa UV theo mét trên sáu batch asphalt/concrete High/Low; asphalt lặp mỗi 3m, concrete 2.5m. Không kéo giãn một mảng texture lên toàn đảo. Thêm tám rãnh thoát nước sát mặt đường, gộp một draw/tier; giữ nguyên 531 node khác. [Bản ghi promotion/backup](surface-promotion.json).
- Tàu: [sơn marine cream/navy từ Blender](fleet/README.md), giữ nguyên toàn bộ 303 node xuất ra và rig. Tạo va chạm từ các mặt sàn, cabin, hàng hóa, ghế và lan can thực trong GLB đã chọn LOD; cập nhật theo rig. Hunter, Prop và đồ vật thả xuống được mang theo boong tàu. Bỏ mặt đất vô hình y=0 trên biển.
- Chết đuối: client và server phân biệt chân đang được boong skiff đỡ với chân thật sự chìm dưới biển. Không miễn chết cho cả một hộp lớn bao quanh tàu. Rơi xuống biển vẫn có 3 giây để thoát; giữ Jump ở mép ngoài map không còn tạo lối leo lên không khí.
- Nước: thêm sóng/bọt sát đúng mặt ngoài kè, dải nước vỗ thành, gợn nhỏ được lọc theo khoảng cách; mở rộng biển để không lộ góc tấm nước cũ. Không thêm lượt refraction/transmission. [Chi tiết shader, ngân sách và 6 cấu hình kiểm tra](water/README.md).
- Rà soát lối đi: kiểm tra cả mô hình thực và collider, không chỉ kiểm tra tên node. Sửa nhà vườn Low, hai sàn bê tông công trường và ba cửa Operations; [báo cáo structural RP03](../repair-review/market-rp03/structural-route-repairs.md). Đã ghép wood carve và đổi URL phiên bản cho các asset mới.

## Nguồn Blender và phục hồi

- `art-source/harbor-v2/container-bd/container-bd-market-rp03.blend`
- `art-source/harbor-v2/island/island-surfaces-rp03.blend`
- Các nguồn structural/fleet là bản phái sinh riêng, không ghi đè nguồn RP02/RL01.

Asset sản xuất nằm trong `client/public/assets/maps/harbor-v2/`. Pipeline lưu bản GLB trước promotion dưới `art-source/harbor-v2/_staging/`; không xóa bản cũ. Bản dựng lại cần chạy đúng script versioned RP03, không chỉ chạy builder gốc.

## Phạm vi kiểm chứng

Kiểm tra tự động bao gồm hình học GLB thật, lối mở, mặt sàn/mái, các bậc thang đã có, collider động, Hunter/Prop đứng trên 5 tàu qua chu kỳ sóng, đồ vật rơi xuống boong, và luồng input client → server → chết đuối. Bộ chụp runtime tạo phòng solo riêng, không tham gia phòng người dùng.

Ảnh `market-*-4k.png` là render Blender 3840×2160. Ảnh runtime và phép đo FPS dùng viewport 1600×900, DPR1 trên máy local; không phải cam kết 4K/60FPS cho mọi thiết bị. Chụp thử shader trong lúc các tác vụ Blender/test khác chạy **không** được coi là benchmark cuối.

Va chạm hiện vẫn dùng hộp AABB nhẹ, không phải mô phỏng thân tàu tam giác hay rigid-body đầy đủ. Khi tàu nghiêng, chân theo mặt trên AABB có thể có sai khác nhỏ với mặt boong nghiêng. Cáp, lưới, các mặt thân cong không phải bề mặt đi lại. Đường chân trời góc bay cao vẫn còn khác màu giữa fog xám và phần dưới HDR; không coi đây là bản photorealistic hoàn tất hay bảo đảm không còn mọi bug.

## Kiểm thử cuối

- Client: **226/226 test đạt**; bao gồm vật lý tàu qua chu kỳ sóng cho Hunter/Prop, kích thước lỗ đạn, cổng, mái/bậc thang và các đường đi cũ.
- Server: 18/18 test tập trung về nước/luồng di chuyển/tàu đạt. Toàn bộ suite: 99 đạt, 10 lỗi cũ. Bản HEAD riêng tái hiện đúng cả 10 lỗi cùng thông báo; không thay luật chia đội/tính điểm để làm xanh các test cũ. [Đối chiếu baseline](server-baseline.json).
- Đo ray trên toàn scene đã ghép: **18 điểm High + 18 điểm Low**, không lệch giữa lối mở/mặt sàn nhìn thấy và collider tại các điểm kiểm tra. Đây không phải kiểm tra mọi tam giác hay mọi quỹ đạo người chơi.
- Browser thực + server mới: High/Low đều đứng an toàn trên cả 5 tàu. Hai skiff High đã hạ chân xuống dưới -0.9m mà vẫn khô/sống; sau khi rơi ra biển nhận đúng một sự kiện chết sau 3 giây. Báo cáo `art-source/harbor-v2/_staging/snapshots/rp03-boat-high-threshold-report.json` và `rp03-boat-low-final-report.json`.
- Build production client/server và TypeScript đạt; lint phần runtime/kiểm thử mới không có lỗi. Build vẫn cảnh báo chunk Three.js lớn hơn 500kB, không phải lỗi build.

## Hiệu năng và ảnh trong game

Đo sau khi khóa source/GLB, không chạy đồng thời browser QA khác, Blender hay build. Mỗi cấu hình: 10 góc, mỗi góc 4 giây đứng yên + 4 giây xoay 360°; warmup ban đầu 16 giây. Viewport 1600×900/DPR1, âm thanh tắt, Chrome headless trên máy local.

| Cấu hình | FPS thấp nhất của các đoạn đo | P95 cao nhất | Khung hình trên 50ms |
| --- | ---: | ---: | ---: |
| WebGPU High | ~60 | 16.8ms | 0 |
| WebGL2 High | ~60 | 16.8ms | 0 |
| WebGL2 Low | 59.3 | 16.8ms | 1 (66.7ms, góc tàu) |

Góc tàu Low được đo lại hai lần, mỗi lần 20 giây đứng yên + 8 giây xoay. Cả 56 giây không có khung trên 50ms và không ghi nhận LongTask/Long Animation Frame; một khung 33.3ms. Chưa xác định nguyên nhân của khung 66.7ms ban đầu, không xóa số liệu cũ hay khẳng định đã hết mọi khựng.

High trên hai backend còn được bắn liên tục vào biển và tường: 4 đoạn × 12 giây, 41–42 phát/đoạn; khoảng 60FPS, không khung trên 50ms. Tác vụ CPU `fire()` lớn nhất 3.2ms, geometry giữ 327; dấu đạn tường lớn nhất 0.13m. Đã bỏ lượt duyệt toàn bộ các node tĩnh của đảo mỗi frame chỉ để cập nhật dây neo; chỉ cập nhật tổ tiên socket và rig động cần thiết.

[Số liệu đầy đủ + SHA asset đã dùng](final/verification-summary.json). Đây là đo rAF, không phải GPU timer hay thử tải nhiều người chơi, và không có cam kết hiệu năng 4K/mobile. Đã kiểm tra shader nước trên cả High/Medium/Low ở WebGL2/WebGPU riêng trước lượt benchmark này.

Ảnh game cuối:

- [Harbor Market](final/rp03-webgpu-high-containerBDShop.png), [nội thất](final/rp03-webgpu-high-harborMarketInterior.png).
- [Tàu cập cảng](final/rp03-webgpu-high-workboatDetail.png), [công trường](final/rp03-webgpu-high-adConstructionRoute.png).
- [Cửa sổ nhà vườn Low](final/rp03-webgl2-low-acWindows.png), [toàn đảo](final/rp03-webgpu-high-overview.png).

## Mở bản local đã cập nhật

Preview dùng `http://localhost:5174` với server mới ở cổng 2568. Vite/server cũ tại 5173/2567 không bị tắt để tránh cắt phiên đang mở. Server 2567 là tiến trình Node chạy từ trước và không tự reload phần chết đuối mới; chỉ refresh trang 5173 không thay được code server. Bản kiểm thử riêng chạy Node 22, dùng dữ liệu phòng/analytics riêng trong `/tmp/catchandrun-rp03-server.zLt2LH`.

Code và GLB nằm trong cùng repository; chưa commit/push hay deploy lên server online.
