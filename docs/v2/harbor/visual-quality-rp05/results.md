# RP05 — kết quả, bằng chứng và giới hạn

Ngày kiểm tra: 2026-09-17. Đã tích hợp **trạm xuất phát Hunter và cửa mở theo phase**
vào bản Three.js hiện có, không chuyển engine, không thay toàn đảo. Branch
`codex/visual-quality-rp05`, HEAD `708d368`, giữ nguyên công việc chưa commit trước đó.
Đây là một mẫu nâng cấp cục bộ hoàn chỉnh để kiểm chứng quy trình, **chưa phải bản
phát hành đã đạt toàn bộ gate**.

## Bàn giao

- [Workflow và lệnh chạy](README.md): khảo sát, ngân sách, asset policy và điều kiện QA.
- [Build Blender → GLB](../../../../tools/visual-qa/build.mjs), [recipe](../../../../tools/visual-qa/build_station.py), [kiểm tra asset](../../../../tools/visual-qa/validate_asset.mjs).
- [Render 5 góc GLB](../../../../tools/visual-qa/render_asset.py), [capture game + hai client](../../../../tools/visual-qa/capture.mjs), [so sánh hiệu năng](../../../../tools/visual-qa/compare.mjs), [promotion có kiểm tra hash](../../../../tools/visual-qa/promote_station.mjs).
- [Nguồn Blender mới](../../../../art-source/harbor-v2/response-station/response-station-rp05.blend), [GLB game đang tải](../../../../client/public/assets/maps/harbor-v2/zones/response-station.glb).
- [Cửa runtime](../../../../client/src/game/world/HunterGateState.ts), [đèn trạm](../../../../client/src/game/world/lighting/responseStationLighting.ts), [tích hợp map](../../../../client/src/game/world/maps/harborV2Map.ts), [cache version](../../../../client/src/game/world/zones/harborZones.ts), [regression cửa](../../../../client/tests/HunterGateState.test.ts).

Asset SHA256: `fa74181b2d6f53816acbb99be3aa60d1130ff3d73cd761b515450339573feb9a`.
Payload 1,701,648 bytes. LOD0: 11 primitives / 14,635 triangles; LOD1: 11 / 10,051.
Không thêm collider; giữ hợp đồng shell, cửa, nền và mái có sẵn. Thêm ray cửa,
hộp thu cửa, gioăng và chi tiết khung gắn vào kiến trúc. Sơn navy, nhôm satin và
trần nhám thay vật liệu tôn bị lặp trên nhiều bộ phận. Hai đèn cục bộ không đổ bóng
ở High/Medium; Low không thêm đèn. Cửa dịch chuyển hình học vào hộp thu, không co
toàn bộ chữ/slat; phần cuộn khuất không được mô phỏng cơ học.

## Xem trước / sau

Đây là ảnh chụp **game thật**, không phải ảnh concept sinh bởi AI:

- [Trạm trước](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/baseline/live-responseStationEntry.png) / [trạm sau](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/after/live-responseStationEntry.png).
- [Cửa trước, frame 04](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/baseline/gate-04.png) / [cửa sau, frame 04](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/after/gate-04.png).
- [Video cửa trước](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/baseline/gate-review-8x-slow.mp4) / [video cửa sau](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/after/gate-review-8x-slow.mp4): 16 frame cố định, xem chậm 8 lần, không dùng để đo FPS.
- [Chuỗi chạy/nhảy/đổi hướng/dừng](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/after/movement-sequence.mp4): 16 frame camera Hunter FOV75; thời điểm thực nằm trong JSON, video trình bày 4 fps.
- [Quan sát Hunter từ client thứ hai](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/after/remote-00.png).
- [Blender oblique trước](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/asset-before/oblique.png) / [sau](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/asset-after/oblique.png); cùng thư mục có front, back, side, window-detail. Blender dùng ánh sáng preview, không thay cho QA ánh sáng game.
- [Low/WebGL2](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/low-webgl2/live-responseStationEntry.png), [market đối chứng](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/after/live-harborMarketFront.png), [toàn đảo đối chứng](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/after/live-overview.png).

Agent đã mở và xem cả 5 góc GLB trước/sau; ảnh runtime trạm, market, overview;
các frame cửa 00/02/04/08/15; movement 03/15 và remote 00; Low entry và gate 04.
Không chỉ dựa vào việc công cụ trả về tên file. Đây là tập ảnh đã review, không
phải tuyên bố đã xem mọi pixel/mọi frame của toàn đảo.

## Hiệu năng và môi trường

Apple M4, RAM 24GiB, macOS 26.5.2 arm64, Node 22.22.1, Chrome 152.0.7977.84
headless, ANGLE Metal, 1280×720 DPR1, seed 17092026. Three 0.181.0; Blender 5.2.1
LTS build `9e2066aef7ef`; glTF-Transform 4.5.0. Vite local 5175, Colyseus local 2569.
Không dùng Brev, không phát sinh dịch vụ/chi phí. Không kiểm tra shipping bundle trên
thiết bị thật; CI cấu hình Node20 khác runtime local.

Đợi đủ 7 zone, map, shader/weapon warm-up rồi settle 2 giây mỗi góc. Mỗi phép đo
4 giây lấy raw rAF, không dùng dt game đã clamp. Không render Blender/build/chụp
frame trong đoạn đo. Tất cả camera static trước/sau dùng cùng cấu hình.

| Góc High/WebGPU | p95 trước → sau (ms) | Max sau (ms) | Frame >50ms trước → sau | Render draw calls trước → sau |
| --- | --- | --- | --- | --- |
| Cửa trạm | 16.7 → 16.8 | 16.8 | 0 → 0 | 227 → 233 |
| Trạm, góc chéo | 16.8 → 16.8 | 16.8 | 0 → 0 | 238 → 246 |
| Market | 16.8 → 16.8 | 16.8 | 0 → 0 | 203 → 207 |
| Toàn đảo | 16.7 → 16.8 | 16.8 | 0 → 0 | 465 → 473 |

[So sánh máy đọc được](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/comparison.json),
[baseline đầy đủ](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/baseline/report.json),
[sau tích hợp](../../../../art-source/harbor-v2/_staging/visual-qa-rp05/after/report.json).
Low/WebGL2 có p95 16.7–16.8ms, max16.8ms, không >50ms ở cùng 4 góc, nhưng không có
baseline Low riêng nên **chỉ là smoke test**, không kết luận Low nhanh hơn trước.

Scene ổn định tăng từ 262 lên 266 mesh, 301,021 lên 301,917 triangles; render-pass
triangles overview từ 542,073 lên 543,865. Texture-memory estimate High vẫn khoảng
205.5MiB, Low128.2MiB. Đây không phải tối ưu giảm polygon/draw-call; mẫu thêm chi tiết
trong ngân sách và chưa đo thấy hồi quy frame-time ở các mẫu này. Renderer bị giới
hạn nhịp khoảng60Hz nên kết quả không chứng minh còn bao nhiêu GPU headroom.

Readiness elapsed 14.44s baseline, 20.59s after gồm chờ phase, không dùng để kết luận
load chậm hơn; per-resource duration/bytes được giữ trong report. Banner bắt đầu
round xuất hiện trong ảnh baseline đầu tiên; HUD, đồng hồ server và phase sóng không
pixel-deterministic. Motion baseline FOV60 khác final75, không dùng pixel-diff cho
motion. Chưa đo GPU timestamps, GPU memory thật, 4K, mobile hay long-session stress.

## Bảng nghiệm thu

| Tiêu chí | Bằng chứng | Kết quả |
| --- | --- | --- |
| Build Blender/export có nguồn, hash, license/tool trace | `asset/build-manifest.json`, native `.blend`, `build.mjs` đã chạy | Đạt trong môi trường ghi trên; font hệ thống là dependency |
| Units/pivot/normals/UV/material, payload/LOD budget | `asset/validation.json`; 0 glTF errors, 10 tangent warnings được giữ | Đạt có giới hạn portability; UV presence không thay visual review |
| 5 góc standalone và bối cảnh game | `asset-before/`, `asset-after/`, `after/live-*.png` đã mở xem | Đạt cho mẫu |
| Cửa không bóp méo chữ, reset về đúng source | Regression fail trước/fix sau; `gate-*.png`, gate tests | Đạt |
| Floor/roof/gate/exit lane, cả hai LOD | `asset/build-manifest.json.routeValidation`, 75 probe/LOD và ResponseStationIntegration | Đạt trong phạm vi probe |
| Hai client, HIDING chặn và ACTIVE mở | Hai session cùng room; `phaseEvents`, `multiplayer` trong report High/Low | Đạt, server phase thật; biến dạng cửa chỉ client |
| Camera/gameplay movement | 16 frame, controller thật, input tổng hợp, không teleport; client khác nhận vị trí | Đạt tuyến mẫu; không xác nhận mọi góc hẹp/animation |
| Chạy → nhảy → tiếp đất → strafe → dừng | Feet bắt đầu0/0.14m, lên≈2.71m, về0m; vị trí cuối ổn định | Đạt quan sát tuyến mẫu; chưa chứng nhận foot-slide/weight toàn bộ nhân vật |
| p95 ≤ max(20ms, baseline×1.15), spike không tăng quá1 | `comparison.json` bốn hàng pass | Đạt headless local ngắn |
| Full client suite sau tích hợp | `client-final.log`: 47 file, 382/382 test | Đạt |
| Asset gate harness | `asset-gate-final.log`: 36 Node tests +23 client tests | Đạt |
| Asset/physics regressions | `pipeline/summary.json`: 86 static probes, 6 negative controls;104 movement,96 regression,18 server-water tests | Đạt bounded; nhiều test trùng full client suite, không cộng như test độc lập |
| Lint/version/build | `lint-final.log`:0 lỗi/1182 warnings; version1.1.0; production build pass | Đạt lệnh; warnings vẫn còn, Three bundle≈970KB có chunk warning |
| Full repository tests | `tests.log`: server99 pass/10 fail ở4 file | **Chưa đạt — chặn release/mở rộng** |
| Va chạm trong0.45s cửa đang mở khi đứng ép sát | Chưa có swept-contact scenario cho đúng vị trí này | **Chưa kiểm tra**; collider vẫn bỏ lúc ACTIVE như logic cũ |
| Chân thực toàn đảo, toàn bộ góc lag, camera corner và foot slide | Ngoài mẫu và probes hiện tại | **Chưa kiểm tra đầy đủ**, không gắn nhãn pass |

Các script kiểm tra tự động không tự cấp duyệt mỹ thuật. `pipeline/summary.json`
cố ý giữ `readyToPromote:false`; report so sánh giữ `readyToExpand:false`. Review
ảnh và capture browser bổ sung ở đây không xóa blocker của full server suite.

## Nhật ký phát hiện → sửa → xem lại

| ID / mức độ | Ảnh hoặc vị trí | Nguyên nhân / xử lý | Tình trạng |
| --- | --- | --- | --- |
| V01 / P2 | `baseline/live-responseStationEntry.png`, trần và header | Tôn lặp trên nhôm/sơn; emissive không chiếu sáng trần. Refinish roof slab thật, coat/satin,2 practical không shadow | Xem lại `after/live-responseStationEntry.png`: trần/khung đọc được; Low vẫn phân biệt đường đi |
| V02 / P2 | `baseline/gate-04.png`, chữ/slat | ScaleY cả gate. Dịch exposed vertices lên, cap phần khuất trong headbox; reset rest vertices | Xem 00/02/04/08/15, regression xác nhận spacing và reset |
| V03 / P2 | `candidate/live-responseStationEntry.png`, nhôm sát đèn | Bản đầu intensity26 gây hotspot. Giảm10 | Xem `candidate-final` và `after`; dùng bản10 |
| V04 / P2 | `after/movement-03.png`, tiếp cận bậc kho đối diện | Camera đang nhảy gần mặt bậc, viewmodel không phải bằng chứng collider bị xuyên | Giữ frame/telemetry; test station không xác nhận mọi góc cầu thang kho |
| V05 / P2 | `after/remote-00.png`, Hunter | Model procedural dạng khối và animation tối giản vẫn không cùng mức chi tiết kiến trúc | Chưa nâng cấp nhân vật; cần pose/contact temporal review riêng |
| V06 / P2 | `after/live-overview.png`, biển và đường chân trời | Mặt nước vẫn lặp pattern, đảo còn phẳng ở góc xa | Ghi nhận, không sửa shader toàn đảo trong mẫu trạm |
| Q01 / P1 release gate | `tests.log`, server tests | RoleAssigner2, ScoringSystem4, GameplayFlow3, MatchStateMachine1 fail; khác kỳ vọng tỷ lệ Hunter/tick điểm/solo end, mock thiếu setMetadata | Không thay luật game/test để ép pass. Hash source server liên quan giống baseline (`server-preexisting.json`) |
| Q02 / giới hạn harness | Browser log, request pointer lock | Headless không có user gesture/active root hợp lệ | Chỉ allowlist pointer-lock ở QA;0 lỗi browser khác. Chưa thay thế manual input test |

Skill systematic-debugging định hướng việc tái hiện lỗi cửa bằng regression trước
khi sửa và tách nguyên nhân khỏi phỏng đoán đồ họa. GitNexus không có công cụ khả
dụng trong phiên; khảo sát bằng source trực tiếp, không dựa trên graph chưa xác minh.

## Tiếp theo theo tác động / chi phí

1. **Cao / nhỏ–vừa:** thống nhất luật server hiện tại rồi sửa các test lệch/missing mock;
   chạy lại full gate trước mở rộng map. Không tự đổi balance chỉ vì test cũ.
2. **Cao / vừa:** thêm route đứng sát cửa khi release, quay lại dưới cửa và round reset;
   quyết định collider-clearance timing cùng server nếu thấy xuyên tại mép đang chuyển động.
3. **Cao / vừa:** chạy headed trên thiết bị mục tiêu, stress quay camera/bắn/chạy10–15 phút,
   thu CPU/GPU trace. Chỉ tối ưu water pass, lights, materials hay draw calls khi trace chỉ rõ.
4. **Vừa / vừa:** mở rộng cùng pipeline sang một khu (market hoặc bến tàu), sửa pattern nước/
   shoreline và material scale qua effect sandbox, không nâng texture toàn đảo lên4K.
5. **Vừa / lớn:** nhân vật: concept/mesh hiện có → rig/pose thực dùng → contact/foot-slide
   và network interpolation review. Chỉ chọn Meshy/dịch vụ khi thiếu asset phù hợp và có
   giấy phép/quyền truy cập; mẫu này không cần API key.

Dừng polish ở mẫu này. Không commit/deploy, không đánh dấu đồ họa toàn game là hoàn
thiện. Bằng chứng lớn và bản sao bảo toàn nằm dưới `_staging` (Git ignored); cần lưu
trọn thư mục khi chuyển máy. Nguồn và scripts mới vẫn là thay đổi chưa commit.
