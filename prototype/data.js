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
      { id: 'CLOSET', name: '옷장·수납', photo: 'assets/photos/closet.jpg' },
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
})();
