# Fleet + water RP04 — khu tiếp theo sau Market

Ngày 10/09/2026. Tham chiếu [concept 09 đã duyệt](../photoreal-direction-rp04/09-working-fleet.png). Đây là lượt dựng/kiểm tra tàu và chân kè, không phải toàn đảo hoặc chuyển engine sang Unreal. Trạng thái thay asset phải đọc trong `promotion.json` khi có; bản staging không tự trở thành production.

**Đã áp dụng vào game local** qua [promotion.json](promotion.json): chỉ `client/public/assets/maps/harbor-v2/zones/ferris-harbor.glb` và metrics tương ứng được thay; tám GLB khác giữ nguyên. Bản cũ có rollback theo hash. URL mặc định `?v=20260910-rp04-b51a69ec` đã trả HTTP200, đúng3.990.856byte/SHA `b51a69ec535d54b440f35a9aa11fe69b8fc7adc8ba777e840daf75bfa3cc08bc`. Chưa deploy hoặc commit. Chọn **High** để xem fittings mới; Low giữ nguyên mô hình thô nhẹ.

## Kết quả cuối v4

[Review hình ảnh](visual-review.json) · [Vật lý độc lập](verification/physics-review.md) · [Gate sau tích hợp](post-promotion-gate/summary.json)

Đã mở lại game từ URL mặc định, **không dùng staging hoặc ghi đè response asset**: [ảnh trong game đã áp dụng](applied-local/applied-local-workboatDetail.png), [toàn đội tàu](applied-local/applied-local-fleetDetail.png), [chứng cứ HTTP/build](applied-local-proof.json). Đây là ảnh Three.js thực tế, khác với render Blender offline bên dưới.

| Backend / chất lượng | Ba góc tĩnh + quay360°: khoảng FPS | p95 lớn nhất | Khung lâu nhất | Khung >50ms | Thử boong / chết đuối trực tiếp |
| --- | ---: | ---: | ---: | ---: | --- |
| WebGPU High | 60,0 | 16,8ms | 16,8ms | 0 | Đạt / đạt |
| WebGL2 Low | 59,5–60,0 | 16,8ms | 33,4ms | 0 | Đạt / đạt |
| WebGL2 High | 60,0 | 16,8ms | 16,8ms | 0 | Không chạy lại ở tổ hợp này |
| WebGPU Low | 60,0 | 16,8ms | 16,8ms | 0 | Không chạy lại ở tổ hợp này |

Đây là khoảng requestAnimationFrame trong Chrome headless1600×900 tắt âm thanh, mỗi góc đo4giây và quay4giây; không phải GPU timestamps hay bảo đảm khung hình thật/4K60 trên máy khác. Cả bốn báo cáo `final-*-v4` tải cùng chín GLB và source SHA `70e5105104f47c443197fc0a54e9e9cd9638bb3b8669917b3239017ddf331ac9`, không có lỗi ứng dụng sau bộ lọc quyền. Raw microphone/pointer-lock errors vẫn được giữ. Không suy ra nguyên nhân tăng FPS từ so sánh với baseline có tải máy khác.

High+Low có **646 mẫu chân trên đúng mặt boong** của năm tàu: không lệch plane, không bơi nhầm. Server-position matches được tính lại từ tọa độ thô, mỗi tàu có ít nhất30mẫu qua3giây Hunter sống. Bài thử giữ Jump sau khi rơi khỏi hỗ trợ khô ghi đúng sự kiện chết đuối và trạng thái spectator/health0 ở client/server. Bằng chứng này không chứng minh mọi cú nhảy hay mọi disguise; các ca nhảy/đồ vật được đo riêng bằng controller trong gate.

Bắn High:41 va chạm nước và40 vết đạn tường, kích thước lớn nhất0,13m; không có khoảng rAF>50ms trong hai lượt bắn12giây này. Không kết luận hết lag toàn đảo hoặc âm thanh hết khựng. Toàn client381test, guard56test, fullTypeScript và Vite build đều đạt; build còn cảnh báo chunk Three vendor≈970kB, không che cảnh báo bằng cách tăng ngưỡng.

## Art từ Blender

- Buồng lái: gioăng/khung cửa, cần gạt, vít, bản lề, tay nắm, biển tên gắn vách, nẹp và chân cột radar.
- Tàu hàng: dây quấn tời, nẹp gỗ và đai thép quanh thùng có sẵn, vòng đai thùng phuy. Xuồng có chân mái chèo, khóa chèo và cuộn dây.
- Chi tiết mới bám theo rig từng tàu, không rải vật cản vào lối đi. Buồng lái vẫn là khối kín đã có collision; cửa có chi tiết không đồng nghĩa đã cho phép mở/vào phòng.
- Giữ nguyên mọi mesh/UV/material, boong, collider, rig và socket gốc. 659 đối tượng Blender không đổi; 303 node GLB giữ nguyên nội dung trước khi thêm 5 nhánh fittings. Không đổi Market và bảy GLB còn lại.
- Một batch chi tiết High cho mỗi tàu: thêm 5 draw calls, không thêm texture. Toàn asset Ferris Harbor: High 50.512 triangles/95 draws dưới ngân sách 60.000/96; Low 3.460/26 không đổi; texture GPU ước tính 27,66 MiB dưới 32 MiB. Đây không phải số cả đảo hay chứng nhận 60 FPS.
- Kiểm tra khoảng cách mesh phát hiện bốn chốt chèo lơ lửng 10,7 cm và hai vòng dây nhỏ không chạm sàn. Đã bỏ chúng; kiểm tra native bổ sung buộc chốt/dây còn lại cách bề mặt gốc không quá 15 mm (bản cuối đo tối đa 1,2 mm).

Nguồn gốc `ferris-harbor-fleet-rp03.blend` được giữ lại; bản mới nằm tại `art-source/harbor-v2/ferris-harbor/ferris-harbor-fleet-rp04.blend`. Các fittings có `boatDetailOnly`: chỉ bổ sung hình ảnh gần bề mặt cũ, không được biến thành một sàn vô hình qua thuật toán tách collider.

## Nước và vật lý

[Bọt sóng/kiểm tra shader](water/README.md): bọt theo độ cao đỉnh–đáy Gerstner hiện có thay vì một đồng hồ dao động riêng. Không thêm lượt render phản xạ, không đổi mực nước/hull mask/ripple. Bộ test tính trực tiếp biểu thức shader có ca đỉnh–đáy và ra ngoài dải kè; phải xem thêm ảnh thực và chuyển động.

Đã sửa phép lấy mặt boong: broadphase vẫn dùng hộp bao, tiếp xúc chân/đầu dùng mặt hữu hạn theo transform thật của tàu. Vật duplicate xếp chồng tính từ dưới lên, không tự đỡ mình; người đứng trên đồ vật nhận chuyển động tàu đúng một lần, người đang nhảy không bị kéo theo. Test mới bao phủ cả năm tàu ở High/Low, Hunter/Prop và đồ rời, xuồng thấp, với negative controls xóa support. Gate bắt buộc chạy đủ 104 tên ca candidate, không chỉ kiểm tra tổng số test. Kết quả game thực được ghi riêng sau khi chạy bản cuối.

## Luồng xuất và kiểm tra

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python tools/harbor-v2/upgrade_fleet_rp04.py
node tools/harbor-v2/finalize_fleet_rp04.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python tools/harbor-v2/validate_zone.py -- --glb art-source/harbor-v2/_staging/fleet-rp04/ferris-harbor-runtime.glb --zone FERRIS_HARBOR --metrics art-source/harbor-v2/_staging/fleet-rp04/ferris-harbor-runtime.metrics.json
node tools/harbor-v2/verify_asset_pipeline.mjs --asset-dir art-source/harbor-v2/_staging/fleet-rp04/assets
```

Candidate có đủ9GLB, chỉ Ferris Harbor thay. Browser dùng `--candidate-root fleet-rp04/assets`, phiên/profile QA riêng; hash bytes thực tải phải trùng native/headless/review. Chỉ chạy `promote_fleet_rp04.mjs --gate <summary.json> --review <visual-review.json>` sau bốn tổ hợp WebGPU/WebGL2 × High/Low và kiểm tra tàu/nước. `--check-only` không thay production. Bản GLB/metrics cũ được sao lưu theo hash.

## Bằng chứng và giới hạn

- `before/`: baseline game trước lượt này, đã có các frame chậm khi bắn.
- `candidate-preliminary/`: **bản art bị loại**, hash4b830c…; native validator phát hiện một số nẹp thùng xoay lạc ra gốc thế giới do đọc `matrix_world` trước depsgraph update. Đã bổ sung update và guard từng chi tiết nằm trong envelope tàu. Không dùng các ảnh này làm bằng chứng art cuối.
- Các capture `final-webgpu-high`, `final-webgpu-high-02`, `final-webgl2-low`, `final-webgl2-high`, `final-webgpu-low` là **lịch sử kiểm tra trung gian**, dù tên có chữ `final`. Đã phát hiện bài thử Low đặt Launch/Workboat lên mái cabin; không dùng chúng để chứng nhận năm boong. Bài thử mới dùng track đã đối chiếu mesh, thả chân 20 cm xuống boong được chỉ định và so từng mẫu với chính mặt boong đó. File `promotion.json` và review được nó trỏ tới mới xác định phiên bản đã áp dụng.
- `final-webgl2-low-v3` đạt 240 mẫu trên năm boong, nhưng lượt High `final-webgpu-high-v3` bị loại: quy tắc chọn mặt thấp nhất chọn nhầm dải thân BARGE dưới sàn gỗ 57 cm. Guard đã chặn việc áp dụng asset. Giao thức tiếp theo phải ràng buộc đúng mesh và kích thước mặt boong trong hệ tọa độ tàu theo từng LOD; không chỉ chọn một mặt hỗ trợ bất kỳ hoặc đổi sang mặt cao nhất.
- Giao thức `designated-deck-v2` thực hiện ràng buộc mesh/bounds trên, đồng thời tính lại từng mẫu khớp vị trí server từ tọa độ thô; yêu cầu ít nhất 30 mẫu Hunter sống trong vòng đang chạy, trải dài ít nhất 3 giây. Bài test không reset anti-cheat để ép dịch chuyển QA thành công. Bộ 56 test chứng cứ từ chối cả báo cáo v1, mặt thân chìm, mái, tọa độ server giả và mẫu quá ngắn. `final-gate-04` đạt 86 probes/6 negative controls, 104 ca candidate, 96 hồi quy client và 18 server; toàn client đạt 381/381. Các kết quả này không thay thế ma trận trình duyệt v4.
- Các báo cáo `consoleErrors` của công cụ loại lỗi quyền pointer-lock/microphone; raw logs vẫn giữ chúng. Chưa xác nhận chuột/voice có người dùng thật chỉ bằng capture headless.
- Low không được nâng chi tiết và chưa đạt photorealistic. High vẫn còn vật liệu/hàng hóa đơn giản; hình concept là mục tiêu, không phải ảnh game thực.
- [Ảnh Blender Cycles 3840×2160](blender/workboat-cycles-3840x2160.png) là render native offline; biển/ánh sáng trong ảnh là preview riêng, không phải shader Three.js. `blender/render.json` ghi hash nguồn và ảnh. Không dùng ảnh này làm bằng chứng FPS hay va chạm.
- Một trường hợp mép sàn xoay yaw 20° chỉ chạm góc bàn chân còn có thể bị sampler từ chối. Năm rig tàu hiện tại không xoay yaw; đây là giới hạn đã biết, không được gọi là đã kiểm chứng mọi tư thế tùy ý.
- Gerstner hiện có sai khác giữa xz đã displacement trong GPU và sampleHeight CPU (mẫu High đo tối đa khoảng5cm). Lượt foam không giải quyết phép nghịch đảo này.
- Chưa chứng nhận hết lag,4K60FPS, mọi disguise, mọi khu hoặc multiplayer có độ trễ. Render Blender nếu có phải ghi rõ là ảnh offline, không thay cho ảnh Three.js.
