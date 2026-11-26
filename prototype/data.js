/* 샘플 데이터 — 프로토타입 전용. 여기 있는 이름·연락처·주소·접수는 모두 지어낸 예시이고, 화면에는 '샘플'로 표시된다.
 * 처음 열 때 이 값이 localStorage에 복사되고, 이후의 추가·수정·삭제는 localStorage에서만 일어난다.
 * 관리자 화면의 "샘플 데이터 초기화"는 이 값으로 되돌린다. 날짜는 오늘을 기준으로 계산해 언제 열어도 어색하지 않게 한다. */
(function () {
  const day = (offset) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
  };
  const stamp = (offset) => day(offset).replaceAll('-', '');

  window.GD_SAMPLE = {
    // 사업자 정보: 정해지지 않은 값은 비워 둔다 (비어 있으면 화면에 나오지 않는다)
    site: { company: '가구다방', tagline: '이사 전 가구 위탁 판매와 방문 수거', ceo: '', bizNo: '', phone: '', hours: '', address: '' },

    categories: [
      { id: 'SOFA', name: '소파', photo: 'assets/photos/sofa.jpg' },
      { id: 'BED', name: '침대', photo: 'assets/photos/bed.jpg' },
      { id: 'DINING', name: '식탁', photo: 'assets/photos/dining.jpg' },
      { id: 'CLOSET', name: '옷장과 수납장', photo: 'assets/photos/closet.jpg' },
      { id: 'DESK', name: '책상', photo: 'assets/photos/desk.jpg' },
      { id: 'ETC', name: '기타 가구', photo: 'assets/photos/etc.jpg' },
    ],

    notices: [
      { id: 'n1', sample: true, date: day(-2), title: '가구 사진은 이렇게 찍어 주세요', body: '첫 장은 가구 전체가 보이게, 나머지는 흠집이나 얼룩이 있는 곳을 가까이에서 찍어 주세요. 밝은 곳에서 찍으면 상태 확인이 빨라집니다.' },
      { id: 'n2', sample: true, date: day(-9), title: '반출 당일에 확인할 것', body: '가구 안의 물건을 미리 비워 주세요. 엘리베이터 사용이 예약제인 건물은 반출 시간에 맞춰 예약해 두면 작업이 빨리 끝납니다.' },
      { id: 'n3', sample: true, date: day(-20), title: '접수는 접수대기 상태일 때 직접 취소할 수 있습니다', body: '진행 조회 화면에서 접수번호와 PIN으로 조회한 뒤 취소할 수 있습니다. 진행이 시작된 뒤에는 고객센터로 문의해 주세요.' },
    ],

    faqs: [
      { id: 'f1', sample: true, q: '회원가입을 해야 하나요?', a: '아니요. 접수할 때 정한 PIN 4자리와 접수번호로 진행 상황을 조회합니다.' },
      { id: 'f2', sample: true, q: '접수한 뒤에 취소할 수 있나요?', a: '모든 품목이 접수대기 상태일 때는 진행 조회 화면에서 직접 취소할 수 있습니다.' },
      { id: 'f3', sample: true, q: '판매 마감일은 누가 정하나요?', a: '이사일과 희망 반출일을 보고 담당자가 품목별로 정합니다. 정해진 날짜는 진행 조회 화면에 표시됩니다.' },
      { id: 'f4', sample: true, q: '한 번에 몇 개까지 접수할 수 있나요?', a: '1개부터 20개까지 접수할 수 있습니다. 품목마다 처리 방식을 따로 고를 수 있습니다.' },
    ],

    // 접수: 상태는 PENDING(접수대기) → IN_PROGRESS(진행중) → SCHEDULED(반출예정) → COMPLETED(처리완료), 또는 CANCELED(취소)
    applications: [
      { id: 'a1', sample: true, code: `FR-${stamp(-1)}-001`, pin: '1234', name: '김하늘', phone: '010-0000-0001', address: '샘플시 샘플구 예시로 12', addressDetail: '101동 1203호', elevator: '있음',
        movingDate: day(2), pickupDate: day(1), memo: '오후 2시 이후에 연락 주세요.', createdAt: day(-1), adminMemo: '',
        items: [
          { id: 'a1i1', category: 'SOFA', name: '3인용 패브릭 소파', condition: '중상', preference: '위탁 판매', status: 'PENDING', saleDeadline: '', pickupSchedule: '', notice: '신청이 접수되었습니다. 담당자가 사진과 일정을 확인하고 있습니다.', photo: 'assets/photos/sofa.jpg' },
          { id: 'a1i2', category: 'DINING', name: '4인용 원목 식탁', condition: '상', preference: '상담 후 결정', status: 'PENDING', saleDeadline: '', pickupSchedule: '', notice: '신청이 접수되었습니다. 담당자가 사진과 일정을 확인하고 있습니다.', photo: 'assets/photos/dining.jpg' },
        ] },
      { id: 'a2', sample: true, code: `FR-${stamp(-6)}-001`, pin: '1234', name: '이도윤', phone: '010-0000-0002', address: '샘플시 예시구 보기길 34', addressDetail: '2층', elevator: '없음(계단)',
        movingDate: day(9), pickupDate: day(7), memo: '', createdAt: day(-6), adminMemo: '',
        items: [
          { id: 'a2i1', category: 'BED', name: '퀸 침대 프레임', condition: '중상', preference: '위탁 판매', status: 'IN_PROGRESS', saleDeadline: day(5), pickupSchedule: '', notice: '위탁 판매를 진행하고 있습니다. 판매 마감일까지 팔리지 않으면 반출일에 수거합니다.', photo: 'assets/photos/bed.jpg' },
          { id: 'a2i2', category: 'DESK', name: '원목 책상', condition: '중', preference: '단순 처분', status: 'SCHEDULED', saleDeadline: '', pickupSchedule: `${day(7)} 10:00`, notice: '반출 일정이 확정되었습니다. 당일 방문 전에 연락드립니다.', photo: 'assets/photos/desk.jpg' },
        ] },
      { id: 'a3', sample: true, code: `FR-${stamp(-15)}-001`, pin: '1234', name: '박서연', phone: '010-0000-0003', address: '샘플시 보기구 견본로 56', addressDetail: '', elevator: '1층',
        movingDate: day(-3), pickupDate: day(-5), memo: '', createdAt: day(-15), adminMemo: '',
        items: [
          { id: 'a3i1', category: 'CLOSET', name: '5단 수납장', condition: '중', preference: '단순 처분', status: 'COMPLETED', saleDeadline: '', pickupSchedule: `${day(-5)} 14:00`, notice: '수거를 마쳤습니다. 이용해 주셔서 감사합니다.', photo: 'assets/photos/closet.jpg' },
        ] },
    ],
  };

  /* ---------- 깨짐 점검용 데이터 (개발 전용) ----------
   * 주소 끝에 ?data=worst | empty | one | huge 를 붙이면 store.js가 샘플 대신 이 값을 쓴다. 평소 데이터와 저장 칸이 달라 서로 섞이지 않는다.
   * 모두 지어낸 값이다. 길이는 입력 칸이 받는 최대 길이에 맞췄다: 이름 50, 품목명 60, 주소 200, 상세 주소 100, 메모 500, 안내문 500, 제목 80. */
  const base = window.GD_SAMPLE;
  const STATUSES = ['PENDING', 'IN_PROGRESS', 'SCHEDULED', 'COMPLETED', 'CANCELED'];
  const item = (id, o) => ({ id, category: 'ETC', name: '가구', condition: '중', preference: '상담 후 결정', status: 'PENDING', saleDeadline: '', pickupSchedule: '', notice: '신청이 접수되었습니다. 담당자가 사진과 일정을 확인하고 있습니다.', photo: 'assets/photos/etc.jpg', ...o });
  const app = (id, o) => ({ id, sample: true, code: `FR-${stamp(-1)}-001`, pin: '1234', name: '샘플 고객', phone: '010-0000-0000', address: '샘플시 샘플구 예시로 1', addressDetail: '', elevator: '', movingDate: day(7), pickupDate: day(6), memo: '', createdAt: day(-1), adminMemo: '', items: [item(`${id}i1`, {})], ...o });
  const LONG_ADDRESS = '샘플특별자치도 예시시 보기구 견본대로123번길 45-67, 샘플지식산업센터 에이동 12층 1201호부터 1208호까지 (화물 엘리베이터는 지하 2층 하역장에서 타고, 방문 차량은 정문 경비실에서 출입증을 받아야 하며, 주말에는 후문만 열립니다)'.slice(0, 200);
  const LONG_NOTE = ('사다리차가 들어올 수 없는 골목이라 계단으로 내려야 합니다.\n소파는 현관문보다 커서 다리를 분리해야 하고, 침대 프레임은 이미 분해해 두었습니다.\n평일에는 오후 7시 이후에만 집에 있고, 주말에는 오전이 좋습니다. 경비실에 미리 말해 두겠습니다.\n주차는 건물 뒤편 1대만 가능합니다. ').repeat(3).slice(0, 500);
  const LONG_ITEM = '초대형모듈형패브릭코너소파베드겸용수납형오토만포함세트전시상품리퍼브에이급풀패키지구성품일체'.slice(0, 60);

  window.GD_FIXTURES = {
    worst: () => ({
      site: {
        company: '주식회사 가구다방 리빙앤라이프스타일 홀딩스 코리아 서울경기인천 통합물류센터 운영본부', tagline: '이사 전 가구 위탁 판매와 방문 수거, 사무실 이전과 원룸 정리, 대형 폐가구 처분 상담까지 한 번에',
        ceo: 'Christopher Alexander Montgomery III', bizNo: '000-00-00000 (통신판매업 신고 제0000-샘플시샘플구-00000호)', phone: '0000-0000 (평일 상담), 010-0000-0000 (주말 문자 전용)',
        hours: '평일 오전 9시부터 오후 6시까지, 토요일은 오전만, 일요일과 공휴일은 쉽니다', address: LONG_ADDRESS,
      },
      categories: base.categories,
      notices: [
        { id: 'wn1', sample: true, date: day(30), title: '2026년겨울철폭설및한파에따른방문수거일정변경과위탁판매마감일연장신청방법안내(필독)', body: ('폭설이 내리는 날에는 방문 수거를 하루씩 미룹니다.\n미뤄진 일정은 진행 조회 화면에서 확인해 주세요.\n자세한 안내: https://example.com/guide/moving/consignment/pickup-schedule?step=3&from=notice&ref=prototype-worst-case\n').repeat(4).slice(0, 600) },
        { id: 'wn2', sample: true, date: day(-1), title: '휴무', body: '쉽니다.' },
        { id: 'wn3', sample: true, date: day(-2), title: '<b>굵게</b> & "따옴표"가 들어간 제목', body: '**별표**와 <script>alert(1)</script>, &amp; 는 글자 그대로 보여야 합니다.' },
        { id: 'wn4', sample: true, date: day(-800), title: '이전 연도에 올린 공지: 연도가 보이지 않으면 올해 공지처럼 읽힙니다', body: '오래된 공지입니다.' },
      ],
      faqs: [
        { id: 'wf1', sample: true, q: '엘리베이터가없는5층건물에서도대형장롱과킹사이즈침대를계단으로반출할수있나요그리고추가비용이있나요', a: ('가능합니다. 다만 계단 폭과 난간 구조에 따라 분해가 필요할 수 있습니다.\n사진을 먼저 보내 주시면 담당자가 확인합니다.\n').repeat(6).slice(0, 400) },
        { id: 'wf2', sample: true, q: '네?', a: '네.' },
        { id: 'wf3', sample: true, q: 'What happens if nobody buys my furniture before the sale deadline?', a: 'https://example.com/guide/moving/consignment/unsold-items/what-happens-next?tab=pickup&filter=unresolved' },
      ],
      applications: [
        app('w1', { name: 'Aleksandra Wiśniewska-Kowalczyk', code: `FR-${stamp(0)}-1284`, movingDate: day(0), pickupDate: day(0), createdAt: day(0), address: LONG_ADDRESS, addressDetail: '6001동 2503호, 공동현관 비밀번호는 방문 전에 문자로 알려 드리고 지하 3층 주차장 엘리베이터 홀 오른쪽 문으로 들어오세요'.slice(0, 100), elevator: '없음(계단)', memo: LONG_NOTE, adminMemo: (LONG_NOTE + LONG_NOTE).slice(0, 1000),
          history: Array.from({ length: 30 }, (_, i) => ({ at: new Date(Date.now() - i * 3600000).toISOString(), text: `${LONG_ITEM}: 접수대기에서 진행중 상태로 변경` })),
          items: Array.from({ length: 20 }, (_, i) => item(`w1i${i}`, {
            category: base.categories[i % 6].id, photo: i === 2 ? 'assets/photos/missing.jpg' : base.categories[i % 6].photo, status: STATUSES[i % 5],
            name: [LONG_ITEM, '장', '<i>기울임</i> & "따옴표" 소파', '🛋️ 3인용 패브릭 소파 (얼룩 있음) 🪑', 'IKEA_KALLAX_4x4_shelving_unit_white_147x147cm'][i % 5],
            saleDeadline: i % 5 === 1 ? day(3) : '', pickupSchedule: i % 5 === 2 ? `${day(3)} ${String(8 + (i % 12)).padStart(2, '0')}:30` : '', notice: i % 4 === 0 ? LONG_NOTE : '확인 중입니다.',
          })) }),
        app('w2', { name: 'J', code: `FR-${stamp(-140)}-001`, movingDate: day(-128), pickupDate: day(-130), createdAt: day(-140), items: [item('w2i1', { name: '장' })] }),
        app('w3', { code: `FR-${stamp(-3)}-001`, name: '주식회사가나다라마바사인테리어디자인건축사사무소총무팀자산관리파트', phone: '010 - 0000 - 0003', movingDate: day(365), pickupDate: day(360), createdAt: day(-3),
          items: [item('w3i1', { name: '회의용 테이블', status: 'IN_PROGRESS', saleDeadline: day(3) }), item('w3i2', { name: '사무용 책상 12개', status: 'SCHEDULED', pickupSchedule: `${day(3)} 23:30` }), item('w3i3', { name: '파티션', status: 'CANCELED', notice: '부피가 커서 수거가 어렵습니다.' })] }),
        app('w4', { code: `FR-${stamp(-1)}-004`, name: '🦊 여우네 공방 👩🏽‍💻', movingDate: day(3), pickupDate: day(3), items: [item('w4i1', { name: '🪵 원목 작업대', status: 'SCHEDULED', pickupSchedule: `${day(3)} 08:00` })] }),
        app('w5', { code: `FR-${stamp(-400)}-001`, name: 'Đặng Thị Ngọc Hân', movingDate: day(60), pickupDate: day(59), createdAt: day(-400), items: [item('w5i1', { name: '이층 침대', status: 'IN_PROGRESS', saleDeadline: day(45) })] }),
        app('w6', { code: `FR-${stamp(-1)}-005`, name: '김   하늘', movingDate: day(3), pickupDate: day(2), items: [item('w6i1', { name: '식탁 의자 4개' })] }),
        app('w7', { name: '김하늘', code: `FR-${stamp(-1)}-002`, movingDate: day(3), pickupDate: day(2), items: [item('w7i1', { name: '식탁 의자 4개', status: 'COMPLETED' })] }),
        app('w8', { name: 'نور الهدى عبد الرحمن', code: `FR-${stamp(-1)}-003`, movingDate: day(1), pickupDate: day(1), items: [item('w8i1', { name: 'خزانة ملابس', status: 'CANCELED', notice: '고객 요청으로 취소되었습니다.' })] }),
      ],
    }),
    empty: () => ({ site: { company: '가구다방', tagline: '', ceo: '', bizNo: '', phone: '', hours: '', address: '' }, categories: base.categories, notices: [], faqs: [], applications: [] }),
    one: () => ({ ...base, notices: base.notices.slice(0, 1), faqs: base.faqs.slice(0, 1), applications: [app('o1', { name: '한 사람', items: [item('o1i1', { name: '의자 1개', status: 'SCHEDULED', pickupSchedule: `${day(1)} 10:00` })], movingDate: day(1), pickupDate: day(1) })] }),
    huge: () => ({
      ...base,
      notices: Array.from({ length: 120 }, (_, i) => ({ id: `hn${i}`, sample: true, date: day(-i * 3), title: `샘플 공지 ${i + 1}`, body: '샘플 공지 내용입니다.' })),
      faqs: Array.from({ length: 40 }, (_, i) => ({ id: `hf${i}`, sample: true, q: `샘플 질문 ${i + 1}`, a: '샘플 답변입니다.' })),
      applications: Array.from({ length: 1284 }, (_, i) => {
        const mv = (i % 181) - 60;
        return app(`h${i}`, { name: `샘플 고객 ${i + 1}`, code: `FR-${stamp(-(i % 90))}-${String(Math.floor(i / 90) + 1).padStart(3, '0')}`, movingDate: day(mv), pickupDate: day(mv - 1), createdAt: day(-(i % 90)),
          items: Array.from({ length: (i % 3) + 1 }, (_, k) => { const status = STATUSES[(i + k) % 5]; return item(`h${i}i${k}`, { name: `샘플 가구 ${k + 1}`, status, saleDeadline: status === 'IN_PROGRESS' ? day(mv - 2) : '', pickupSchedule: status === 'SCHEDULED' ? `${day(mv - 1)} 10:00` : '' }); }) });
      }),
    }),
  };
})();
