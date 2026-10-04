import { useId } from "react";

/** Original vector scenery: a coastal city, a university, and the highway between them. */
export default function CareerLandscape() {
  const prefix = useId().replace(/:/g, "");
  return <svg className="career-landscape-art" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${prefix}-sky`} x2="0" y2="1"><stop stopColor="#e8f0e5"/><stop offset="1" stopColor="#afd1d6"/></linearGradient>
      <linearGradient id={`${prefix}-water`} x2="0" y2="1"><stop stopColor="#91c7cc"/><stop offset="1" stopColor="#77abb7"/></linearGradient>
      <linearGradient id={`${prefix}-hill`} x2="1" y2="1"><stop stopColor="#93b68e"/><stop offset="1" stopColor="#5e8d7e"/></linearGradient>
      <pattern id={`${prefix}-windows`} width="24" height="31" patternUnits="userSpaceOnUse"><rect x="7" y="8" width="8" height="15" rx="2" fill="#548c98" opacity=".6"/></pattern>
      <pattern id={`${prefix}-glass`} width="26" height="28" patternUnits="userSpaceOnUse"><rect x="4" y="3" width="18" height="21" rx="2" fill="#c9e5d7" opacity=".68"/></pattern>
    </defs>
    <rect width="1600" height="1000" fill={`url(#${prefix}-sky)`}/>
    <circle cx="1195" cy="176" r="82" fill="#f4d39c"/><circle cx="1195" cy="176" r="109" fill="none" stroke="#f4d39c" strokeWidth="1" opacity=".5"/>
    <g className="career-art-clouds" fill="#fff9e9" opacity=".82"><path d="M750 141c-5-20 19-35 37-28 8-36 69-43 87-10 19-6 37 9 35 27h44c7 0 9 11 0 11Z"/><path d="M1280 263c-3-15 15-27 30-24 11-32 49-31 61-8 27-15 46 9 43 24h61c10 0 10 8 0 8Z"/><path d="M393 276c3-24 29-26 40-17 8-26 54-28 63-2 14-9 32-1 34 12h39c9 0 9 7 0 7Z"/></g>
    <path d="M0 467 106 408 184 432 331 321 453 386 546 303 655 371 782 266 909 371 1042 310 1222 381 1364 300 1600 349V682H0Z" fill="#aac6b8"/>
    <path d="M0 526 200 448 338 493 511 400 657 479 813 406 967 458 1201 375 1442 454 1600 394V768H0Z" fill="#88b2a5"/>
    <path d="M0 580c330-69 588-103 861-53 175 31 352-61 739-69v414H0Z" fill={`url(#${prefix}-water)`}/>
    <g fill="none" stroke="#d7e8d7" strokeWidth="2" opacity=".45"><path d="M278 637h104m115-7h73m211-42h110m323-28h49m-662 83h69m-28 40h122m81-40h163m-846 45h109m962-123h97"/><path d="M54 714h72m198 32h153m218-25h64m171-21h116m-521 100h109"/></g>
    <path d="M1112 405c-29 89-175 142-220 225S758 734 623 759 280 760 0 861v139h1600V532c-120 5-249-58-303-81s-119-62-185-46Z" fill={`url(#${prefix}-hill)`}/>
    <path d="M997 585c-52 64-147 92-217 149s-83 86-199 105" fill="none" stroke="#c0cd9d" strokeWidth="16" strokeLinecap="round"/>
    <g stroke="#4f7777" strokeWidth="2" strokeLinejoin="round"><g opacity=".75">
      <path d="M846 447V299l19-12h37v160Z" fill="#e7dbc0"/><path d="M902 447V332l16-8h31v123Z" fill="#b6d3c4"/>
      <path d="M967 455V233l24-12 25 12v222Z" fill="#cae0d0"/><path d="M976 233v222h31V233" fill={`url(#${prefix}-windows)`} stroke="none"/><path d="M982 221v-35h18v35" fill="#619b9d"/>
      <path d="M1026 458V334h56v124" fill="#d4b89c"/><path d="M1029 334h50v124h-50Z" fill={`url(#${prefix}-windows)`} stroke="none"/>
      <path d="M1108 440V282c0-22 50-22 50 0v158" fill="#e8e0c8"/><path d="M1118 290h30v141h-30Z" fill={`url(#${prefix}-windows)`} stroke="none"/><path d="M862 302h27v132h-27Z" fill={`url(#${prefix}-windows)`} stroke="none"/>
    </g><g>
      <path d="M1281 471V357l36-14 64 14v114Z" fill="#f0dfbf"/><path d="M1317 343v128h64V357Z" fill="#d7bc99"/><path d="M1281 357h36v114h-36Z" fill={`url(#${prefix}-glass)`} stroke="none"/><path d="M1340 373h20v21h-20Zm0 37h20v21h-20Z" fill="#547f86"/>
      <path d="M1391 478V317l37-17 69 17v161Z" fill="#78b0af"/><path d="M1428 300v178h69V317Z" fill="#50868e"/><path d="M1393 325h30v142h-30Z" fill={`url(#${prefix}-glass)`} stroke="none"/>
      <path d="M1521 483V393l25-10 63 10v90Z" fill="#d98971"/><path d="M1546 383v100h63v-90Z" fill="#b56d5c"/>
    </g></g>
    <g fill="#c4cbb5" stroke="#4e7778" strokeWidth="2"><path d="M801 501v63l11 11v-76m79-14v62l11 10v-75m79-8v62l11 9v-73m78-14v63l11 7v-72m79-12v66l11 5v-73m78-12v66l11 5v-73"/><path d="M741 505 1292 428l18 14-553 87Z" fill="#cfd3b8"/><path d="M757 515 1298 437" fill="none" stroke="#758b83" strokeWidth="7"/><path d="M743 505 1292 428" stroke="#eef0cf" strokeWidth="3"/></g>
    <g fill="#f6e7c6" stroke="#4d7172" strokeWidth="2" strokeLinejoin="round"><path d="M1016 592 1128 546 1207 572 1096 622Z" fill="#d99679"/><path d="M1016 592v109l80 30V622Z" fill="#e7d0aa"/><path d="M1096 622v109l111-49V572Z"/><path d="m1033 615 17 7v32l-17-6Zm31 12 17 7v32l-17-6Z" fill="#74a6a4"/><path d="m1110 635 23-10v31l-23 10Zm37-16 23-10v31l-23 10Z" fill="#6e9fa5"/><path d="m1110 682 23-10v36l-23 10Zm37-16 23-10v31l-23 10Z" fill="#6e9fa5"/><path d="m1050 675 26 10v38l-26-10Z" fill="#356470"/><path d="m982 710 110 40 155-69 15 8-169 76-123-45Z" fill="#e8d4ac"/><path d="m1038 610 60 22 67-30" fill="none" stroke="#f7eaca" strokeWidth="6"/><path d="m1096 549 0-55 14-6 16 7v54m-25-50h10v18h-10" fill="#efe0bc"/></g>
    <g fill="#356c6c" stroke="#2f6064" strokeWidth="2"><path d="M947 677v52m0-67c-25-26-35-56-7-62 15-4 30 19 25 41 18 0 27 17 17 27-9 9-22 12-35-6Z"/><path d="M1227 639v60m0-67c-20-24-38-49-14-63 26-15 45 18 35 38 23-2 31 17 20 27-13 10-27 10-41-2Z" fill="#638d70"/><path d="M1178 710v40m0-46c-20-19-28-37-8-44 21-8 35 16 26 30 18-2 27 15 12 21-10 4-19 3-30-7Z" fill="#81a46e"/></g>
    <path d="M-120 1027c310-191 482-64 660-95 251-45 249-151 418-180 171-31 216-141 348-166 77-15 207-30 399-18" fill="none" stroke="#d6d7b8" strokeWidth="115"/>
    <path d="M-120 1027c310-191 482-64 660-95 251-45 249-151 418-180 171-31 216-141 348-166 77-15 207-30 399-18" fill="none" stroke="#536e76" strokeWidth="99"/>
    <path d="M-120 1027c310-191 482-64 660-95 251-45 249-151 418-180 171-31 216-141 348-166 77-15 207-30 399-18" fill="none" stroke="#d8dfca" strokeWidth="3" strokeDasharray="20 19"/>
    <path d="M1280 857c-8-126 48-206 143-239" fill="none" stroke="#d7d4ae" strokeWidth="40"/><path d="M1280 857c-8-126 48-206 143-239" fill="none" stroke="#6e8280" strokeWidth="29"/>
    <g transform="translate(955 744) rotate(-11)" stroke="#355e67" strokeWidth="2.5" strokeLinejoin="round"><ellipse cy="14" rx="49" ry="18" fill="#294d57" opacity=".23" stroke="none"/><rect x="-32" y="4" width="13" height="19" rx="4" fill="#294d57"/><rect x="24" y="4" width="13" height="19" rx="4" fill="#294d57"/><path d="m-43 5 7-21 20-6 15-24h35l17 27 9 5v25h-99Z" fill="#f2c983"/><path d="m-7-21 14-20h22l13 21Z" fill="#85b9c1"/><path d="M13-41v20m-50 26h95" fill="none"/><path d="M-39-8h14v8h-16m84-8h12v8H43" fill="#fff0ce" strokeWidth="1.5"/><rect x="-12" y="4" width="31" height="8" rx="2" fill="#f3e8ce" strokeWidth="1"/></g>
    <g transform="translate(1321 570) rotate(-5)" stroke="#355e67" strokeWidth="2" strokeLinejoin="round"><rect x="-17" y="6" width="8" height="11" rx="2" fill="#294d57"/><rect x="17" y="6" width="8" height="11" rx="2" fill="#294d57"/><path d="m-23 6 5-16 13-4 8-15h16l13 16 5 4v18h-60Z" fill="#d77b64"/><path d="m-3-13 8-11h13l8 11Z" fill="#c6e0d7"/></g>
    <g stroke="#526f68" strokeWidth="3" strokeLinecap="round"><path d="M756 882v-38m-8 4 8 6 8-13M830 782v-33m-8 8 8 5 7-15M1275 740v-27m-7 7 7 4 6-12M595 863v-30m-8 8 8 4 7-11"/></g>
    <g fill="#d7ca9d"><ellipse cx="780" cy="879" rx="9" ry="3"/><ellipse cx="814" cy="870" rx="14" ry="4"/><ellipse cx="699" cy="915" rx="10" ry="3"/><ellipse cx="1196" cy="820" rx="17" ry="4"/></g>
    <path d="M0 972c246-41 389-5 529 28H0Zm1369 28c-9-79 62-136 231-151v151Z" fill="#467967"/>
  </svg>;
}
