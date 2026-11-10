import { githubUrl, discordUrl } from "../components/shared";
import { createEnDict } from "./en";
import type { LandingDict } from "./types";
import { koSiteCopy } from "./site-ko";

export function createKoDict(): LandingDict {
  const base = createEnDict();

  return {
    ...base,
    ...koSiteCopy,
    faq: {
      label: "FAQ",
      headline: "자주 묻는 질문.",
      items: [
        {
          question: "morechat.co는 어떤 코딩 에이전트를 지원하나요?",
          answer:
            "morechat.co는 Antigravity, Claude Code, CodeBuddy, CodeArts, Codex, Copilot, Cursor, DeepSeek Harness, DevEco Code, Devin CLI, Dim, Grok, Hermes, Kimi, Kiro CLI, MiniMax Code, Muse Code, Oh-My-Pi, OpenClaw, OpenCode, Pi, Qoder, Qoder CN, Qwen Code, QwenPaw, Reasonix, Trae CLI, ZeroClaw, ZCode 등 29개 코딩 도구를 기본 지원합니다. 데몬이 이미 설치된 CLI를 자동으로 찾아 각각 런타임으로 등록합니다. 소스 코드가 공개되어 있으므로 직접 백엔드를 추가할 수도 있습니다. 셀프 호스팅에서는 Qoder PAT와 Qoder Cloud Agents의 기존 에이전트를 사용하여 태스크 실행용 관리형 원격 런타임으로 Qoder Cloud Agents를 설정할 수 있습니다.",
        },
        {
          question: "셀프 호스팅만 가능한가요, 클라우드 버전도 있나요?",
          answer:
            "둘 다 가능합니다. Docker Compose나 Kubernetes로 자체 인프라에 직접 호스팅할 수도 있고, morechat.co가 운영하는 클라우드 버전을 그대로 쓸 수도 있습니다. 데이터를 어디에 둘지는 직접 선택할 수 있습니다.",
        },
        {
          question: "morechat.co를 상업적으로 사용할 수 있나요?",
          answer:
            "네. 조직 내부에서 morechat.co를 사용하는 것은 무료이며, 팀 전체를 위해 셀프 호스팅하는 경우도 마찬가지입니다. 상용 라이선스는 호스팅 서비스나 매니지드 서비스처럼 조직 외부 사람들에게 morechat.co를 제공하거나, 판매·배포하는 제품에 morechat.co를 포함할 때만 필요합니다. 자주 묻는 사례는 [라이선스 안내](/licensing)에서 확인하세요.",
        },
        {
          question: "코딩 에이전트를 직접 쓰는 것과 무엇이 다른가요?",
          answer:
            "코딩 에이전트는 실행에 강합니다. morechat.co는 그 위에 작업 대기열, 팀 협업, 스킬 재사용, 런타임 모니터링, 에이전트별 작업 현황을 한눈에 보는 통합 화면을 얹습니다. 에이전트를 팀 안에서 운영하기 위한 관리 계층이라고 보시면 됩니다.",
        },
        {
          question: "에이전트가 긴 작업도 자율적으로 처리할 수 있나요?",
          answer:
            "네. morechat.co는 대기열 등록, 수락, 실행, 완료 또는 실패까지 작업 흐름 전체를 관리합니다. 에이전트는 막힌 부분을 먼저 알려 주고, 진행 상황은 실시간으로 기록됩니다.",
        },
        {
          question: "코드는 안전한가요? 에이전트는 어디서 실행되나요?",
          answer:
            "에이전트는 여러분의 컴퓨터(로컬 데몬)나 연결한 런타임에서 실행되며, 코드 저장소 안에서 바로 작업합니다. 워크스페이스에 입력한 내용(태스크, 댓글, 채팅 메시지, 첨부 파일, 에이전트가 보고하는 진행 상황)은 morechat.co에 저장되고, 에이전트가 쓰는 코딩 도구는 프롬프트와 코드를 여러분이 설정한 모델 제공자에게 보냅니다. 워크스페이스 데이터를 자체 서버에 두고 싶다면 morechat.co를 셀프 호스팅하세요. 자세한 내용은 [개인정보 처리방침](/privacy)을 참고하세요.",
        },
        {
          question: "에이전트는 몇 개까지 실행할 수 있나요?",
          answer:
            "하드웨어가 감당할 수 있는 만큼 실행할 수 있습니다. 에이전트마다 동시 실행 수를 조절할 수 있고, 여러 대의 머신을 런타임으로 함께 연결할 수도 있습니다. 셀프 호스팅할 때는 별도의 제한이 없습니다.",
        },
      ],
    },
    changelog: {
      title: "변경 로그",
      subtitle: "morechat.co의 새로운 업데이트와 개선 사항입니다.",
      toc: "모든 릴리스",
      categories: {
        features: "새 기능",
        improvements: "개선 사항",
        fixes: "버그 수정",
      },
      entries: [
        {
          version: "0.1.0",
          date: "2026-11-10",
          title: "브랜드 개편, 에이전트 아바타, 프리셋 갤러리, 원클릭 배포",
          changes: [],
          features: [
            "브랜드 개편: 제품 이름을 morechat.co(중국어 이름 李陌茶)로 바꿨습니다. 로고, 푸터 저작권, 페이지 제목, 공유 카드, 메타데이터를 모두 새 이름으로 맞췄습니다.",
            "Grok 엔진 아바타: 에이전트 아바타를 32px 단색 원과 눈으로 새로 그렸습니다. 모란디 팔레트에서 색을 고르고 동작 중에는 살짝 움직입니다. 같은 마크를 화면 곳곳에서 사용합니다.",
            "프리셋 갤러리: 스킬 팩 39개, 스쿼드 5개, 스킬 113개를 기본 제공합니다. 빈 설정에서 시작하지 않고 팀을 바로 구성할 수 있습니다.",
            "원클릭 배포: quickstart로 서버와 웹을 한 번에 띄웁니다. 상태 확인과 셀프 호스팅 설정도 포함됩니다.",
            "지식 도메인: Paperclip에서 파생한 지식 도메인을 데이터베이스에 넣었습니다. 스키마 마이그레이션 637–640이 항목, 출처, 청크, 검색 인덱스를 다룹니다.",
            "Runtime Configurator: 런타임 머신의 모델, 동시 실행 수, 타임아웃을 화면에서 편집합니다.",
            "로그인 스테이지: 로그인 페이지를 자체 스테이지 레이아웃으로 다시 만들었습니다. 싱글 사인온과 워크스페이스 선택은 그대로입니다.",
          ],
        },
      ],
    },
    about: {
      title: "morechat.co 소개",
      nameLine: {
        prefix: "morechat.co — ",
        mult: "Mult",
        iplexed: "iplexed ",
        i: "I",
        nformationAnd: "nformation and ",
        c: "C",
        omputing: "omputing ",
        a: "A",
        gent: "gent.",
      },
      paragraphs: [
        "morechat.co라는 이름은 1960년대의 선구적인 운영체제 Multics에서 따왔습니다. Multics는 여러 사용자가 하나의 컴퓨터를 공유하면서도 각자 자기 컴퓨터를 쓰는 것처럼 느끼게 해 주는 시분할이라는 개념을 처음 널리 퍼뜨렸습니다. Unix는 Multics를 의도적으로 단순화하며 태어났습니다. 한 사용자, 한 작업, 하나의 우아한 철학에 집중한 결과였습니다.",
        "지금 비슷한 전환점이 다시 오고 있다고 봅니다. 지난 수십 년 동안 소프트웨어 팀은 사실상 단일 스레드로 일해 왔습니다. 엔지니어 한 명이 한 작업을 맡고, 한 번에 하나의 맥락만 다루는 식이었습니다. AI 에이전트는 이 공식을 바꿉니다. morechat.co는 시분할의 발상을 다시 꺼내 오되, 이번에는 시스템을 함께 쓰는 \"사용자\"가 사람과 자율 에이전트 양쪽을 의미하는 시대에 맞게 다시 풀어냅니다.",
        "morechat.co에서 에이전트는 정식 팀원입니다. 사람 동료와 똑같이 태스크를 할당받고, 진행 상황을 보고하고, 막힌 부분을 알리고, 코드를 배포합니다. 담당자 선택, 활동 타임라인, 작업 생명주기, 런타임 인프라는 모두 이 전제를 중심으로 처음부터 설계되었습니다.",
        "Multics가 그랬듯, 핵심은 multiplexing입니다. 작은 팀이라고 작게 움직일 필요는 없습니다. 올바른 시스템이 있다면 엔지니어 두 명과 에이전트 한 무리가 스무 명짜리 팀처럼 움직일 수 있습니다.",
        "morechat.co의 소스 코드는 공개되어 있으며 무료로 셀프 호스팅할 수 있으며, 워크스페이스 데이터는 여러분의 인프라에 저장됩니다. 모든 코드를 들여다보고, API를 확장하고, 원하는 LLM 제공자를 연결하고, 커뮤니티에 기여할 수 있습니다.",
      ],
      cta: "GitHub에서 보기",
      team: {
        title: "morechat.co를 만드는 사람들",
        paragraphs: [
          "morechat.co는 2021년부터 함께 일해 온 작은 팀이 만들고 있습니다. morechat.co 이전에는 개발자를 위한 AI 검색 엔진 devv.ai를 만들었습니다. 2025년, 저희가 계속 부딪혀 온 문제, 즉 작은 팀이 AI 에이전트와 함께 실제로 일을 해내는 방법에 집중하기 시작했고, 그 결과가 morechat.co입니다.",
          "소스 코드가 공개되어 있고 셀프 호스팅도 가능하므로, morechat.co 위에 무언가를 만들기 전에 모든 코드를 직접 확인할 수 있습니다. 셀프 호스팅한 배포는 전부 여러분의 인프라에서 실행됩니다. 상업적 이용 방식은 [라이선스 안내](/licensing) 페이지에서 자세히 설명합니다.",
        ],
        contacts: [
          { label: "상용 라이선스 및 영업", linkLabel: "영업팀 문의", href: "/contact-sales" },
          { label: "라이선스 안내", linkLabel: "라이선스 FAQ", href: "/licensing" },
          { label: "커뮤니티 및 지원", linkLabel: "Discord", href: discordUrl },
          { label: "소스 코드 및 이슈", linkLabel: "GitHub", href: githubUrl },
        ],
      },
    },
    licensing: {
      title: "라이선스",
      intro: [
        "morechat.co는 내부 라이선스로 배포됩니다. 운영하는 조직 내부에서의 사용을 전제로 하며, 이 페이지는 재배포 권한을 부여하지 않습니다. 조직 내부에서 morechat.co를 사용하는 것은 무료이며, 팀 전체를 위해 셀프 호스팅하는 경우도 마찬가지입니다.",
        "가장 중요한 조건은 호스팅 방식의 이용에 관한 것입니다. 조직 외부 사람들에게 morechat.co를 제공하려면 상용 라이선스가 필요합니다. 이 페이지에서는 자주 받는 질문을 바탕으로 그 기준을 설명합니다. 이해를 돕기 위한 안내일 뿐 법률 자문이 아니며, 서면으로 제시된 라이선스 조건과 다른 부분이 있다면 그 조건이 우선합니다.",
      ],
      rule: {
        title: "판단 기준",
        text: "조직 외부의 누군가가 이 인스턴스를 움직이고 있나요? 즉 태스크를 만들거나, 에이전트와 대화하거나, 작업을 실행시키고 있나요? 그렇다면 웹, Slack, API 등 어떤 경로를 통하든 호스팅 서비스에 해당합니다. 여러분의 팀이 morechat.co로 만든 결과물만 받아 본다면 내부 사용입니다.",
      },
      scenarios: {
        title: "자주 묻는 사례",
        scenarioColumn: "사례",
        licenseColumn: "상용 라이선스",
        required: "필요",
        notRequired: "불필요",
        items: [
          {
            scenario: "조직 내부에서 morechat.co 사용",
            example: "셀프 호스팅, 워크스페이스 수와 관계없이.",
            required: false,
          },
          {
            scenario: "고객을 위해 morechat.co를 구축하고, 고객이 직접 소유하며 내부에서 사용",
            example: "도입 지원, 교육, 컨설팅, 커스터마이징 등.",
            required: false,
          },
          {
            scenario: "우리 팀이 morechat.co로 고객 업무를 하고, 고객은 결과물만 받음",
            example: "예: morechat.co로 콘텐츠 제작을 관리하고 완성본을 납품하는 에이전시.",
            required: false,
          },
          {
            scenario: "에이전트가 고객의 Slack 채널로 리포트나 알림을 일방적으로 보내기만 함",
            example: "고객은 메시지를 읽기만 하고 인스턴스와 상호작용하지 않습니다.",
            required: false,
          },
          {
            scenario: "자체 인프라에서 고객을 위해 morechat.co 인스턴스를 운영·관리",
            example: "매니지드 서비스. 요금 부과 여부와 관계없습니다.",
            required: true,
          },
          {
            scenario: "조직 외부 사람이 여러분의 인스턴스에 로그인",
            example: "고객, 파트너, 일반 사용자가 자신의 계정을 갖는 경우.",
            required: true,
          },
          {
            scenario: "조직 외부 사람이 다른 경로로 여러분의 인스턴스를 움직임",
            example: "morechat.co를 백엔드로 쓰는 공개 웹사이트, Slack 연동, API 등. 무료로 제공하더라도 마찬가지입니다.",
            required: true,
          },
          {
            scenario: "판매하거나 배포하는 제품에 morechat.co를 포함",
            example: "morechat.co가 다른 상용 제품의 구성 요소로 제공되는 경우.",
            required: true,
          },
        ],
      },
      sections: [
        {
          heading: "기타 조건",
          bullets: [
            "브랜딩: 서면으로 브랜딩 면제를 받지 않았다면, morechat.co 인터페이스에 표시되는 morechat.co 로고, 제품명, 저작권 및 출처 표시를 제거하거나 변경하지 마세요.",
            "출처 표시: morechat.co 인터페이스 없이 백엔드, 데몬, CLI를 기반으로 제품을 만든다면 저작권 및 NOTICE 정보를 유지하고, 사용자용 문서에 morechat.co를 기반으로 만들었다는 사실을 [GitHub 저장소](" + githubUrl + ") 링크와 함께 밝혀 주세요.",
            "포크: 포크의 소스 코드를 공개하는 것 자체는 호스팅 서비스가 아니므로 상용 라이선스가 필요하지 않습니다. 다만 그 포크로 호스팅 서비스를 운영하는 사람은 각자 상용 라이선스를 받아야 합니다.",
            "상용 라이선스와 브랜딩 면제는 별개의 허가입니다. 하나를 받았다고 다른 하나가 포함되지는 않습니다.",
          ],
        },
        {
          heading: "상용 라이선스 받기",
          paragraphs: [
            "[영업팀 문의](/contact-sales)로 사용 사례를 알려 주시면 영업일 기준 3일 이내에 답변드립니다. 라이선스가 필요한지 잘 모르겠다면 [Discord](" + discordUrl + ")나 같은 양식으로 편하게 물어보세요.",
          ],
        },
      ],
    },
    privacy: {
      title: "개인정보 처리방침",
      lastUpdated: "최종 업데이트: 2026년 10월 22일",
      intro: [
        "이 개인정보 처리방침은 Index Labs (Hong Kong) Limited(이하 “morechat.co” 또는 “저희”)가 여러분이 morechat.co를 방문하거나, 저희에게 문의하거나, 호스팅 서비스인 morechat.co Cloud(웹, 데스크톱, 모바일 앱 포함)를 이용할 때 개인정보를 어떻게 수집, 이용, 공유하는지 설명합니다.",
        "이 방침은 여러분이 직접 호스팅하는 morechat.co에는 적용되지 않습니다. 셀프 호스팅 배포의 데이터는 운영자가 관리하며, 어떤 AI 제공자, 연동 서비스, 분석 도구를 쓰는지는 운영자의 설정에 따라 달라집니다. 셀프 호스팅 서버가 저희에게 보내는 것은 하루 한 번의 사용 현황 스냅샷뿐입니다. 여기에는 같은 서버의 스냅샷을 서로 연결하기 위한 무작위 배포 ID, 서버 버전, 워크스페이스·멤버·에이전트·연결된 데몬의 대략적인 수, 그날 시작·완료·실패·취소된 실행 수, 그리고 지난 1·7·28일 동안 웹 또는 데스크톱 앱을 연 멤버 수와 직접 에이전트 실행을 시작한 멤버 수의 대략적인 값이 담깁니다. 이름, 이메일 주소, 콘텐츠는 포함되지 않습니다. DO_NOT_TRACK=1로 설정하면 이 스냅샷을 끌 수 있습니다.",
        "이 방침은 영어 원문을 기준으로 합니다. 한국어 번역본과 영어 원문의 내용이 다를 경우 영어 원문이 우선합니다.",
      ],
      sections: [
        {
          heading: "수집하는 정보",
          bullets: [
            "계정 정보: 이름, 이메일 주소, 프로필 사진. Google로 로그인하면 Google로부터 이름, 이메일 주소, 프로필 사진을 받습니다. 언어, 시간대, 자기소개 같은 프로필 정보와 온보딩 답변(역할, 사용 목적, morechat.co를 알게 된 경로 등)을 입력할 수도 있습니다.",
            "여러분이 만든 콘텐츠: 워크스페이스, 태스크, 댓글, 채팅 메시지, 첨부 파일, 에이전트 지침 등 여러분이나 여러분의 에이전트가 morechat.co Cloud에 입력하는 모든 것.",
            "영업팀 문의: 이름, 업무용 이메일, 회사명과 규모, 국가 또는 지역, 사용 사례, 목표, 연락 수신 설정. 악용을 막기 위해 양식을 제출한 IP 주소와 브라우저 user agent도 기록합니다.",
            "결제 정보: 구독 결제는 Stripe가 호스팅하는 페이지에서 Stripe가 처리합니다. 저희는 전체 카드 정보를 받거나 저장하지 않습니다.",
            "사용 및 기기 정보: 앱 버전, 운영체제, 클라이언트 유형, 무작위로 생성된 설치 ID, 런타임으로 연결한 각 머신의 이름(기본값은 호스트 이름), 그리고 충돌 및 오류 보고서. 보고서를 보내기 전에 오류 메시지에서 식별 가능한 이메일 주소와 인증 정보를 걸러 내지만, 보고서에는 문제 상황에 관한 다른 정보가 남아 있을 수 있습니다.",
            "피드백: 피드백을 보내면 그 내용과 함께 페이지, 앱 버전, 운영체제, 오류 정보를 받습니다.",
          ],
        },
        {
          heading: "정보 이용 목적",
          bullets: [
            "morechat.co Cloud의 제공, 운영, 보호(로그인, 워크스페이스 동기화, 알림 및 초대 발송 등).",
            "영업팀 문의와 지원 요청에 대한 응답.",
            "로그인 코드, 워크스페이스 초대 등 서비스 메시지 발송. 제품 소식이나 마케팅 정보는 동의한 경우에만 보내며, 언제든지 수신을 거부할 수 있습니다.",
            "morechat.co 이용 현황 파악, 버그 수정, 제품 개선.",
            "악용 방지와 법적 의무 이행.",
          ],
        },
        {
          heading: "처리의 법적 근거",
          paragraphs: [
            "처리의 법적 근거를 밝혀야 하는 지역에서는 다음을 근거로 개인정보를 처리합니다. morechat.co Cloud를 제공하기 위한 여러분과의 계약 이행, morechat.co의 보안 유지·지원·개선 및 문의 응대에 관한 저희의 정당한 이익, 마케팅 정보 수신에 대한 여러분의 동의, 그리고 법적 의무의 준수입니다.",
          ],
        },
        {
          heading: "AI 기능",
          paragraphs: [
            "코딩 에이전트는 여러분이 설정한 코딩 도구와 계정으로, 여러분의 머신이나 연결한 런타임에서 실행됩니다. 에이전트가 로컬에서 실행된다고 해서 모델 추론까지 로컬에서 이뤄지는 것은 아닙니다. 이런 도구는 프롬프트, 코드, 파일, 도구 실행 결과를 각자의 모델 제공자에게 보내며, 그 처리는 여러분이 쓰는 도구와 계정의 약관을 따릅니다. morechat.co는 에이전트의 작업을 조율합니다.",
            "채팅 제목 생성이나 후속 작업 제안 같은 morechat.co Cloud의 일부 기능은 결과를 만들기 위해 첫 채팅 메시지나 최근 몇 개의 메시지를 저희가 선택한 외부 대규모 언어 모델 제공자에게 보냅니다. morechat.co는 여러분의 콘텐츠를 AI 모델 학습에 사용하지 않습니다.",
          ],
        },
        {
          heading: "쿠키와 분석",
          paragraphs: [
            "로그인 상태 유지, 사이트 간 요청 위조 방지, 업로드한 파일 접근에 필요한 쿠키를 사용합니다. 또한 어떤 캠페인이나 웹사이트를 통해 방문했는지를 최대 30일 동안 기억하는 쿠키와, 언어 및 마지막으로 연 워크스페이스를 기억하는 쿠키도 사용합니다.",
            "제품 이용 현황 파악과 충돌 보고서 수집에는 PostHog를 사용합니다. 로그인한 상태에서는 보고서를 계정과 연결하기 위해 계정의 이름과 이메일이 PostHog로 전송됩니다. 광고용 쿠키는 사용하지 않으며, 여러분의 개인정보를 판매하지 않습니다.",
          ],
        },
        {
          heading: "정보 공유 대상",
          paragraphs: [
            "워크스페이스에 입력한 정보는 워크스페이스 권한에 따라 다른 멤버와 관리자, 그리고 이들이 허용한 에이전트와 연동 서비스가 볼 수 있습니다. 워크스페이스가 조직에 속해 있다면 그 조직이 콘텐츠를 관리하며, 관련 요청도 조직이 처리할 수 있습니다.",
            "법령이 요구하는 경우 정보를 공개하며, morechat.co가 합병, 인수, 자산 매각의 대상이 되는 경우 정보가 인수자나 승계자에게 이전될 수 있습니다.",
            "그 밖에는 morechat.co 운영을 돕는 서비스 제공자, 그리고 여러분이 연결하기로 선택한 연동 서비스와만 개인정보를 공유합니다.",
          ],
          bullets: [
            "Amazon Web Services: 호스팅, 파일 저장, 콘텐츠 전송",
            "Vercel: 웹사이트 및 웹 앱 호스팅",
            "Stripe: 결제 및 청구",
            "Resend: 로그인 및 초대 이메일",
            "PostHog: 제품 분석 및 충돌 보고서",
            "Google: Google 로그인을 선택한 경우",
            "대규모 언어 모델 제공자: 위에서 설명한 AI 기능",
            "여러분이 연결한 연동 서비스(Slack, Lark, DingTalk, WeCom, Telegram, GitHub, GitLab, Composio로 연결한 앱 등): 여러분이 이를 통해 주고받는 데이터이며, 각 서비스의 약관도 적용됩니다",
          ],
        },
        {
          heading: "정보 저장 위치",
          paragraphs: [
            "morechat.co Cloud는 Amazon Web Services와 Vercel에서 호스팅됩니다. 저희와 서비스 제공자는 미국 및 기타 국가나 지역에서 여러분의 정보를 처리할 수 있습니다. 어디에서 처리되든 이 방침에 따라 정보를 보호합니다.",
          ],
        },
        {
          heading: "보관 기간",
          paragraphs: [
            "계정 정보와 워크스페이스 콘텐츠는 계정이나 워크스페이스가 존재하는 동안 보관합니다. 워크스페이스 소유자가 워크스페이스를 삭제하면 태스크, 댓글 등 그 안의 콘텐츠는 morechat.co Cloud에서 제거됩니다. 다만 복구용 백업에는 삭제 후 일정 기간 사본이 남아 있을 수 있습니다. 삭제된 워크스페이스에 업로드된 파일을 파일 저장소에서 지우고 싶다면 [support@morechat.co](mailto:support@morechat.co)로 이메일을 보내 주세요. 결제 기록은 회계 및 세무 규정이 요구하는 기간 동안 보관하고, 제품 분석 데이터, 충돌 보고서, 영업팀 문의, 피드백은 지원과 제품 개선에 필요한 기간 동안 보관합니다. 문의와 피드백은 요청하시면 삭제합니다.",
          ],
        },
        {
          heading: "여러분의 선택과 권리",
          paragraphs: [
            "거주 지역의 법령에 따라 여러분은 개인정보의 열람, 정정, 삭제, 내보내기를 요청하고, 특정 처리에 반대하거나 이를 제한하고, 이미 한 동의(예: 마케팅 정보 수신 동의)를 철회하고, 해당 지역의 개인정보 보호 감독기관에 불만을 제기할 권리가 있을 수 있습니다. 프로필은 morechat.co에서 언제든지 수정할 수 있고, 소유한 워크스페이스는 설정에서 삭제할 수 있습니다. 계정 삭제 등 그 밖의 요청은 [support@morechat.co](mailto:support@morechat.co)로 이메일을 보내 주세요. 30일 이내에 답변드립니다.",
          ],
        },
        {
          heading: "보안",
          paragraphs: [
            "전송 구간 암호화, 접근 제어, 연동 서비스 인증 정보의 암호화 저장 등으로 여러분의 정보를 보호합니다. 완벽하게 안전한 시스템은 없으므로, 계정이 도용되었다고 생각되면 바로 연락해 주세요.",
          ],
        },
        {
          heading: "아동",
          paragraphs: [
            "morechat.co는 16세 미만 아동을 대상으로 하지 않으며, 아동의 개인정보를 알면서 수집하지 않습니다.",
          ],
        },
        {
          heading: "방침 변경",
          paragraphs: [
            "이 방침은 수시로 업데이트될 수 있습니다. 새 버전은 이 페이지에 게시하고 상단의 날짜를 업데이트합니다. 중요한 변경이 있으면 시행 전에 알려 드립니다.",
          ],
        },
        {
          heading: "문의하기",
          paragraphs: [
            "morechat.co는 Index Labs (Hong Kong) Limited가 운영하며, 여러분의 개인정보에 대한 책임을 집니다. 개인정보 관련 질문이나 요청은 [support@morechat.co](mailto:support@morechat.co)로 이메일을 보내 주세요.",
          ],
        },
      ],
    },
    download: {
      platforms: {
        macArm64: "macOS · Apple Silicon",
        macX64: "macOS · Intel",
        winX64: "Windows · x64",
        winArm64: "Windows · ARM64",
        linuxX64: "Linux · x64",
        linuxArm64: "Linux · ARM64",
      },
      hero: {
        eyebrow: "데스크톱 앱",
        title: {
          mac: "macOS용 morechat.co 다운로드",
          windows: "Windows용 morechat.co 다운로드",
          linux: "Linux용 morechat.co 다운로드",
          other: "morechat.co 다운로드",
        },
        lead: "데스크톱 앱에는 에이전트 데몬이 포함되어 있어, 이 컴퓨터의 Claude Code, Codex 등 코딩 에이전트가 자동으로 연결됩니다.",
        leadOther: "macOS, Windows, Linux용 데스크톱 앱이며, 모두 에이전트 데몬이 내장되어 있습니다.",
        mobileNote: "morechat.co 데스크톱 앱은 macOS, Windows, Linux에서 실행됩니다. 컴퓨터에서 이 페이지를 열어 다운로드하세요.",
        primary: {
          macArm64Dmg: "Apple Silicon용 다운로드",
          macX64Dmg: "Intel용 다운로드",
          winX64Exe: "Windows용 다운로드",
          winArm64Exe: "Windows ARM용 다운로드",
          linuxAmd64AppImage: "AppImage 다운로드",
          linuxArm64AppImage: "AppImage 다운로드",
        },
        alternate: {
          macArm64Dmg: "Apple Silicon Mac",
          macX64Dmg: "Intel Mac",
        },
        released: "{date} 출시",
        whatsNew: "새로운 내용",
        versionUnavailable: "버전을 확인할 수 없습니다. GitHub에서 모든 릴리스를 확인하세요.",
      },
      allPlatforms: {
        title: "모든 다운로드",
        thisDevice: "이 컴퓨터",
        formatDmg: ".dmg",
        formatZip: ".zip",
        formatExe: ".exe",
        formatAppImage: ".AppImage",
        formatDeb: ".deb",
        formatRpm: ".rpm",
        unavailable: "사용할 수 없음",
        allReleases: "모든 릴리스",
      },
      cli: {
        title: "서버나 원격 개발 환경에서 사용하시나요?",
        sub: "CLI를 설치해 그곳에서 같은 데몬을 실행하세요. SSH에서도 같은 명령을 그대로 사용할 수 있습니다.",
        installLabel: "설치",
        platformGroup: "플랫폼 선택",
        platformMacosLinux: "macOS / Linux",
        platformWindows: "Windows",
        startLabel: "데몬 시작",
        copyLabel: "복사",
        copiedLabel: "복사했습니다",
      },
      started: {
        title: "다운로드가 시작되었습니다",
        retry: "시작되지 않았나요? 다시 시도",
        allDownloads: "모든 다운로드",
        install: {
          title: "설치",
          dmg: ".dmg를 열고 morechat.co를 응용 프로그램 폴더로 드래그하세요.",
          zip: "압축을 풀고 morechat.co를 응용 프로그램 폴더로 옮기세요.",
          exe: "설치 프로그램을 실행하세요. 완료되면 morechat.co가 열립니다.",
          appImage: "AppImage에 실행 권한을 준 다음 실행하세요.",
          deb: "apt 또는 사용 중인 패키지 관리자로 .deb를 설치하세요.",
          rpm: "dnf 또는 사용 중인 패키지 관리자로 .rpm을 설치하세요.",
        },
        signIn: {
          title: "로그인",
          body: "morechat.co를 열고 계정으로 로그인하세요.",
          installed: "이미 설치했나요?",
          open: "morechat.co 열기",
        },
        agents: {
          title: "에이전트 연결",
          body: "morechat.co가 이 컴퓨터의 Claude Code, Codex 등 코딩 에이전트를 자동으로 찾습니다.",
        },
        community: {
          label: "다운로드하는 동안",
          githubTitle: "GitHub에서 morechat.co 팔로우하기",
          githubBody: "저장소에 Star를 눌러 새 릴리스 소식을 받아 보거나, 방금 다운로드한 앱의 코드를 살펴보세요.",
          star: "GitHub에서 Star",
          stars: "Star {count}개",
          discordTitle: "Discord 참여하기",
          discordBody: "질문하고, 워크플로를 공유하고, 팀과 직접 이야기하세요.",
          join: "참여",
          xTitle: "@morechat_co 팔로우",
          xBody: "릴리스 소식과 앞으로의 계획.",
          follow: "팔로우",
        },
      },
    },
    contactSales: {
      pageTitle: "영업팀 문의",
      pageDescription:
        "회사에 사람과 에이전트가 함께 일하는 워크플로를 도입하는 방법을 morechat.co 팀과 함께 이야기해 보세요.",
      eyebrow: "영업팀 문의",
      title: "어떤 도움이 필요하신지 알려 주세요",
      fields: {
        firstName: "이름",
        lastName: "성",
        businessEmail: "비즈니스 이메일",
        businessEmailHint:
          "회사 이메일을 사용하세요. Gmail, Outlook 등 개인 이메일은 사용할 수 없습니다.",
        companyName: "회사명",
        companySize: "회사 규모",
        countryRegion: "국가 / 지역",
        useCase: "morechat.co를 어떻게 사용하거나 어디에 활용하실 계획인가요?",
        goals: "목표 또는 현재 겪고 있는 과제",
        selectPlaceholder: "선택하세요",
        submit: "제출",
        submitting: "제출 중...",
      },
      companySizes: [
        { value: "1-10", label: "직원 1-10명" },
        { value: "11-50", label: "직원 11-50명" },
        { value: "51-200", label: "직원 51-200명" },
        { value: "201-500", label: "직원 201-500명" },
        { value: "501-1000", label: "직원 501-1,000명" },
        { value: "1000+", label: "직원 1,000명 이상" },
      ],
      useCases: [
        { value: "evaluate", label: "팀 도입을 검토 중" },
        { value: "adopt_team", label: "팀 또는 회사에 morechat.co 도입" },
        { value: "self_host", label: "자체 인프라에 셀프 호스팅" },
        { value: "integrate", label: "기존 도구와 morechat.co 연동" },
        { value: "partner", label: "파트너십 또는 리셀러 문의" },
        { value: "other", label: "기타" },
      ],
      countries: [
        "미국",
        "캐나다",
        "영국",
        "독일",
        "프랑스",
        "네덜란드",
        "스웨덴",
        "스위스",
        "스페인",
        "이탈리아",
        "아일랜드",
        "노르웨이",
        "덴마크",
        "핀란드",
        "벨기에",
        "포르투갈",
        "호주",
        "뉴질랜드",
        "일본",
        "대한민국",
        "싱가포르",
        "홍콩 특별행정구",
        "대만",
        "중국 본토",
        "인도",
        "인도네시아",
        "태국",
        "베트남",
        "필리핀",
        "말레이시아",
        "아랍에미리트",
        "사우디아라비아",
        "이스라엘",
        "튀르키예",
        "남아프리카공화국",
        "브라질",
        "멕시코",
        "아르헨티나",
        "칠레",
        "기타",
      ],
      consent: {
        intro:
          "morechat.co는 여러분의 개인정보를 소중히 다룹니다. 제공해 주신 개인정보는 계정 관리와 요청하신 제품·서비스 제공에만 사용합니다. 가끔씩 제품 업데이트, 활용 팁, 도움이 될 만한 인사이트도 함께 전해 드리고 싶습니다. 소식을 받고 싶으시다면 아래에서 선택해 주세요.",
        outreach:
          "서비스 업데이트, 지원 문의, 비즈니스 관련 후속 연락 등 morechat.co로부터 개별 연락을 받겠습니다.",
        updates:
          "morechat.co의 제품 업데이트, 인사이트, 이벤트 초대 소식을 받겠습니다.",
        unsubscribe:
          "언제든 수신을 거부할 수 있습니다. 개인정보와 데이터 권리를 어떻게 다루는지는 다음 문서에서 자세히 확인하실 수 있습니다:",
        submitConsent:
          "\"제출\"을 클릭하시면 요청하신 콘텐츠를 보내 드리기 위해 morechat.co가 정보를 저장하고 처리하는 것에 동의하게 됩니다.",
        privacyLinkLabel: "개인정보 처리방침.",
        privacyLinkHref: "/privacy",
      },
      success: {
        title: "감사합니다. 요청을 잘 받았습니다.",
        message:
          "morechat.co 팀원이 영업일 기준 3일 이내에 답변드릴 예정입니다. 그동안 문서를 둘러보시거나 GitHub에서 스타를 눌러 주세요.",
        cta: "홈으로 돌아가기",
      },
      errors: {
        generic: "문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        rateLimit:
          "최근 이 주소에서 여러 건의 문의가 접수되었습니다. 잠시 후 다시 시도해 주세요.",
        freeEmail:
          "비즈니스 이메일 주소를 사용해 주세요. 무료 이메일 서비스(gmail, outlook 등)는 사용하실 수 없습니다.",
        invalidEmail: "올바른 이메일 주소 형식이 아닌 것 같습니다.",
      },
    },
  };
}
