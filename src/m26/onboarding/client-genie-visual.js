export const CLIENT_GENIE_VISUAL_SCHEMA_VERSION='iberfit.client-genie-visual.v1';

export function clientGenieVisualMarkup(){
  return `<svg class="m26-client-genie" data-m26-client-genie viewBox="0 0 512 512" role="presentation" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="m26-genie-gold" x1=".1" y1="0" x2=".9" y2="1">
        <stop offset="0" stop-color="#fff4c8"></stop>
        <stop offset=".2" stop-color="#e4c46c"></stop>
        <stop offset=".52" stop-color="#c5a059"></stop>
        <stop offset=".78" stop-color="#f4db8a"></stop>
        <stop offset="1" stop-color="#8e6425"></stop>
      </linearGradient>
      <linearGradient id="m26-genie-green" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#16392b"></stop>
        <stop offset=".52" stop-color="#0a2e23"></stop>
        <stop offset="1" stop-color="#04160f"></stop>
      </linearGradient>
      <linearGradient id="m26-genie-tail" x1=".2" y1="0" x2=".8" y2="1">
        <stop stop-color="#fff7d0"></stop>
        <stop offset=".22" stop-color="#eacd77"></stop>
        <stop offset=".56" stop-color="#c5a059"></stop>
        <stop offset="1" stop-color="#7d5520"></stop>
      </linearGradient>
      <radialGradient id="m26-genie-core">
        <stop stop-color="#fffbea"></stop>
        <stop offset=".3" stop-color="#ffe08a"></stop>
        <stop offset=".78" stop-color="#c28f33"></stop>
        <stop offset="1" stop-color="#77501a"></stop>
      </radialGradient>
      <filter id="m26-genie-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.4" result="blur"></feGaussianBlur>
        <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
      </filter>
    </defs>

    <g class="m26-genie__body">
      <ellipse class="m26-genie__shadow" cx="256" cy="455" rx="58" ry="11" fill="#c5a059" opacity=".07"></ellipse>

      <g class="m26-genie__tail">
        <path d="M252 330C224 350 224 377 254 390C294 407 307 429 282 451C265 466 242 469 219 462C248 485 292 477 312 447C336 409 304 385 273 375C251 368 250 349 270 337C293 323 319 324 338 306C313 315 279 310 252 330Z" fill="url(#m26-genie-tail)" opacity=".98"></path>
        <path d="M257 338C242 351 244 369 268 379C300 393 319 414 301 442C290 459 272 466 252 466C275 471 302 456 308 434C314 410 290 392 267 385C245 378 235 353 257 338Z" fill="#fff3bb" opacity=".34"></path>
        <path d="M285 348C310 349 332 335 346 314" fill="none" stroke="#e0bc61" stroke-width="6" stroke-linecap="round" opacity=".5"></path>
      </g>

      <path class="m26-genie__torso" d="M208 187C224 175 240 170 256 170C272 170 288 175 304 187C319 199 327 218 327 242C327 278 313 307 292 331C280 344 268 351 256 351C244 351 232 344 220 331C199 307 185 278 185 242C185 218 193 199 208 187Z" fill="url(#m26-genie-green)" stroke="#b9913a" stroke-width="2.5"></path>
      <path d="M209 190C228 203 243 218 256 241C269 218 284 203 303 190C288 179 272 175 256 175C240 175 224 179 209 190Z" fill="#0a2e23"></path>
      <path class="m26-genie__armor" d="M209 190C230 203 244 218 256 238C268 218 282 203 303 190L289 218C279 238 272 256 256 278C240 256 233 238 223 218Z" fill="url(#m26-genie-gold)" opacity=".9"></path>
      <path d="M218 316C240 328 272 328 294 316" fill="none" stroke="#cda650" stroke-width="7" stroke-linecap="round" opacity=".7"></path>

      <path d="M208 190C187 181 166 188 150 204C141 214 137 226 139 239C156 224 173 216 193 217Z" fill="url(#m26-genie-gold)"></path>
      <path d="M304 190C325 181 346 188 362 204C371 214 375 226 373 239C356 224 339 216 319 217Z" fill="url(#m26-genie-gold)"></path>

      <g class="m26-genie__arm m26-genie__arm--left">
        <path d="M171 218C151 228 137 249 133 274C130 293 136 307 149 313C161 300 169 285 172 268C175 252 184 240 197 233Z" fill="url(#m26-genie-gold)"></path>
        <path d="M149 313C139 321 135 331 140 339C146 347 159 347 170 339C177 334 182 327 183 319C169 322 158 320 149 313Z" fill="#b68732"></path>
        <path d="M143 338C151 342 158 341 165 336" fill="none" stroke="#f1d981" stroke-width="4" stroke-linecap="round"></path>
      </g>

      <g class="m26-genie__arm m26-genie__arm--right">
        <path d="M341 218C361 228 375 249 379 274C382 293 376 307 363 313C351 300 343 285 340 268C337 252 328 240 315 233Z" fill="url(#m26-genie-gold)"></path>
        <path d="M363 313C373 321 377 331 372 339C366 347 353 347 342 339C335 334 330 327 329 319C343 322 354 320 363 313Z" fill="#b68732"></path>
        <path d="M369 338C361 342 354 341 347 336" fill="none" stroke="#f1d981" stroke-width="4" stroke-linecap="round"></path>
      </g>

      <path d="M238 183L240 153L272 153L274 183C268 190 262 194 256 194C250 194 244 190 238 183Z" fill="#09251b" stroke="#b58b37" stroke-width="2"></path>

      <g class="m26-genie__flame" filter="url(#m26-genie-glow)">
        <path d="M255 61C239 87 221 103 224 130C226 150 239 162 255 169C248 146 255 132 271 117C284 105 287 87 278 67C276 86 267 94 260 103C258 84 262 73 255 61Z" fill="url(#m26-genie-gold)"></path>
        <path d="M253 81C244 101 235 113 238 132C240 144 246 151 254 155C252 140 258 130 266 120C274 111 277 100 273 87C268 100 261 107 257 114C256 103 258 92 253 81Z" fill="#fff5c2" opacity=".76"></path>
        <path d="M247 157C255 145 265 137 276 127" fill="none" stroke="#a16d27" stroke-width="3" opacity=".55"></path>
      </g>

      <g class="m26-genie__core" filter="url(#m26-genie-glow)">
        <circle cx="256" cy="244" r="28" fill="#082219" stroke="#dab960" stroke-width="3"></circle>
        <image href="/public/isotipo-iberfit.png" x="239" y="225" width="34" height="38" preserveAspectRatio="xMidYMid meet" opacity=".96"></image>
        <circle cx="256" cy="244" r="21" fill="url(#m26-genie-core)" opacity=".18"></circle>
      </g>

      <g class="m26-genie__beam" filter="url(#m26-genie-glow)">
        <path d="M370 332C412 319 454 297 496 264" fill="none" stroke="#ffe6a0" stroke-width="4" stroke-linecap="round"></path>
        <circle cx="496" cy="264" r="6" fill="#fff5c2"></circle>
      </g>

      <g class="m26-genie__particles" fill="#f3d677" filter="url(#m26-genie-glow)">
        <circle cx="187" cy="151" r="3"></circle><circle cx="326" cy="151" r="3"></circle>
        <circle cx="166" cy="189" r="2.5"></circle><circle cx="347" cy="188" r="2.5"></circle>
        <path d="M202 132l3 7l7 3l-7 3l-3 7l-3-7l-7-3l7-3Z"></path>
        <path d="M311 132l3 7l7 3l-7 3l-3 7l-3-7l-7-3l7-3Z"></path>
      </g>

      <g class="m26-genie__alert" filter="url(#m26-genie-glow)">
        <circle cx="407" cy="169" r="22" fill="#0a2e23" stroke="#ffbf00" stroke-width="4"></circle>
        <path d="M407 157v16M407 184v1" stroke="#ffd55a" stroke-width="5" stroke-linecap="round"></path>
      </g>
    </g>
  </svg>`;
}

export const __clientGenieVisualInternals=Object.freeze({
  stateNames:Object.freeze(['idle','pointing','success','alert']),
});
