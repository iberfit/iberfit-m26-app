export const CLIENT_GENIE_VISUAL_SCHEMA_VERSION='iberfit.client-genie-visual.v2';

export function clientGenieVisualMarkup(){
  return `<svg class="m26-client-genie" data-m26-client-genie viewBox="0 0 512 512" role="presentation" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="m26-genie-gold" x1=".08" y1=".02" x2=".92" y2=".98">
        <stop offset="0" stop-color="#fff6cf"></stop>
        <stop offset=".16" stop-color="#efd78e"></stop>
        <stop offset=".42" stop-color="#c7a153"></stop>
        <stop offset=".7" stop-color="#e9c66f"></stop>
        <stop offset="1" stop-color="#8b6224"></stop>
      </linearGradient>
      <linearGradient id="m26-genie-gold-dark" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#9a6e28"></stop>
        <stop offset=".52" stop-color="#d1aa57"></stop>
        <stop offset="1" stop-color="#6b4617"></stop>
      </linearGradient>
      <linearGradient id="m26-genie-green" x1=".12" y1="0" x2=".88" y2="1">
        <stop stop-color="#174332"></stop>
        <stop offset=".52" stop-color="#0a2e23"></stop>
        <stop offset="1" stop-color="#03150f"></stop>
      </linearGradient>
      <linearGradient id="m26-genie-tail" x1=".2" y1="0" x2=".82" y2="1">
        <stop stop-color="#fff8d8"></stop>
        <stop offset=".18" stop-color="#efd27f"></stop>
        <stop offset=".52" stop-color="#c79b46"></stop>
        <stop offset=".8" stop-color="#f3d47d"></stop>
        <stop offset="1" stop-color="#744715"></stop>
      </linearGradient>
      <radialGradient id="m26-genie-core">
        <stop stop-color="#fffdf1"></stop>
        <stop offset=".28" stop-color="#ffe39a"></stop>
        <stop offset=".68" stop-color="#c69131"></stop>
        <stop offset="1" stop-color="#704914"></stop>
      </radialGradient>
      <radialGradient id="m26-genie-aura">
        <stop stop-color="#ffe8a3" stop-opacity=".34"></stop>
        <stop offset=".52" stop-color="#c5a059" stop-opacity=".1"></stop>
        <stop offset="1" stop-color="#0a2e23" stop-opacity="0"></stop>
      </radialGradient>
      <filter id="m26-genie-glow" x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="3.2" result="blur"></feGaussianBlur>
        <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
      </filter>
      <filter id="m26-genie-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="7"></feGaussianBlur>
      </filter>
    </defs>

    <circle class="m26-genie__aura" cx="256" cy="250" r="170" fill="url(#m26-genie-aura)"></circle>

    <g class="m26-genie__body">
      <ellipse class="m26-genie__shadow" cx="256" cy="466" rx="73" ry="13" fill="#c5a059" opacity=".08"></ellipse>

      <g class="m26-genie__tail">
        <path d="M242 326C213 352 214 381 251 396C290 412 315 431 303 452C294 468 270 478 242 475C271 493 313 481 329 450C348 414 316 388 278 377C250 369 249 347 273 332C301 315 330 316 356 290C325 304 281 303 242 326Z" fill="url(#m26-genie-tail)" opacity=".99"></path>
        <path d="M252 340C234 355 239 374 265 383C301 396 322 416 314 438C308 454 291 466 270 470C294 469 319 451 320 429C320 407 295 389 271 382C250 376 240 354 252 340Z" fill="#fff3bc" opacity=".4"></path>
        <path d="M284 350C318 350 345 333 363 308" fill="none" stroke="#edcd77" stroke-width="7" stroke-linecap="round" opacity=".58"></path>
        <path d="M294 370C322 374 347 364 369 345" fill="none" stroke="#7ab08f" stroke-width="3" stroke-linecap="round" opacity=".34"></path>
        <ellipse cx="288" cy="406" rx="54" ry="14" fill="#e8c66f" opacity=".13" transform="rotate(17 288 406)"></ellipse>
      </g>

      <g class="m26-genie__torso">
        <path d="M205 187C221 172 239 166 256 166C273 166 291 172 307 187C323 201 333 222 333 250C333 284 321 313 298 338C285 352 270 360 256 360C242 360 227 352 214 338C191 313 179 284 179 250C179 222 189 201 205 187Z" fill="url(#m26-genie-green)" stroke="#b88d37" stroke-width="2.5"></path>
        <path d="M209 191C229 199 244 216 256 239C268 216 283 199 303 191L293 223C283 248 271 272 256 291C241 272 229 248 219 223Z" fill="url(#m26-genie-gold)" opacity=".96"></path>
        <path d="M223 228C230 250 240 270 256 290C272 270 282 250 289 228C285 268 280 300 256 325C232 300 227 268 223 228Z" fill="#0b3428" opacity=".92"></path>
        <path d="M225 302C239 311 273 311 287 302" fill="none" stroke="#7caa8b" stroke-width="4" stroke-linecap="round" opacity=".52"></path>
        <path d="M217 321C239 336 273 336 295 321" fill="none" stroke="#d4ae58" stroke-width="7" stroke-linecap="round" opacity=".76"></path>
        <path d="M241 202L256 218L271 202L265 263L247 263Z" fill="#173f31" opacity=".78"></path>
      </g>

      <g class="m26-genie__shoulder m26-genie__shoulder--left">
        <path d="M205 190C182 178 157 187 140 207C132 217 129 229 132 242C151 225 171 216 195 219Z" fill="url(#m26-genie-gold)"></path>
        <path d="M151 203C164 192 181 190 195 196" fill="none" stroke="#fff1bb" stroke-width="3" stroke-linecap="round" opacity=".52"></path>
      </g>
      <g class="m26-genie__shoulder m26-genie__shoulder--right">
        <path d="M307 190C330 178 355 187 372 207C380 217 383 229 380 242C361 225 341 216 317 219Z" fill="url(#m26-genie-gold)"></path>
        <path d="M361 203C348 192 331 190 317 196" fill="none" stroke="#fff1bb" stroke-width="3" stroke-linecap="round" opacity=".52"></path>
      </g>

      <g class="m26-genie__arm m26-genie__arm--left">
        <path d="M171 218C151 228 137 247 132 270C127 290 131 307 143 317C156 307 165 292 169 274C173 256 184 241 199 233Z" fill="url(#m26-genie-gold)"></path>
        <path d="M143 317C132 326 128 338 135 347C142 356 156 354 168 345C176 338 181 330 181 320C166 325 154 323 143 317Z" fill="url(#m26-genie-gold-dark)"></path>
        <path d="M136 333C150 338 163 335 174 326" fill="none" stroke="#fff0b4" stroke-width="3.5" stroke-linecap="round" opacity=".75"></path>
        <g class="m26-genie__ring m26-genie__ring--left">
          <ellipse cx="148" cy="296" rx="24" ry="8" fill="none" stroke="#f6d77d" stroke-width="3" opacity=".72" transform="rotate(-23 148 296)"></ellipse>
          <ellipse cx="148" cy="296" rx="31" ry="11" fill="none" stroke="#74a98b" stroke-width="2" opacity=".28" transform="rotate(-23 148 296)"></ellipse>
        </g>
      </g>

      <g class="m26-genie__arm m26-genie__arm--right">
        <path d="M341 218C361 228 375 247 380 270C385 290 381 307 369 317C356 307 347 292 343 274C339 256 328 241 313 233Z" fill="url(#m26-genie-gold)"></path>
        <path d="M369 317C380 326 384 338 377 347C370 356 356 354 344 345C336 338 331 330 331 320C346 325 358 323 369 317Z" fill="url(#m26-genie-gold-dark)"></path>
        <path d="M376 333C362 338 349 335 338 326" fill="none" stroke="#fff0b4" stroke-width="3.5" stroke-linecap="round" opacity=".75"></path>
        <g class="m26-genie__ring m26-genie__ring--right">
          <ellipse cx="364" cy="296" rx="24" ry="8" fill="none" stroke="#f6d77d" stroke-width="3" opacity=".72" transform="rotate(23 364 296)"></ellipse>
          <ellipse cx="364" cy="296" rx="31" ry="11" fill="none" stroke="#74a98b" stroke-width="2" opacity=".28" transform="rotate(23 364 296)"></ellipse>
        </g>
      </g>

      <path d="M235 187L239 153L273 153L277 187C269 195 263 199 256 199C249 199 243 195 235 187Z" fill="#09271d" stroke="#c19a45" stroke-width="2.4"></path>
      <path d="M240 169C248 174 264 174 272 169" fill="none" stroke="#78a98c" stroke-width="3" opacity=".48"></path>

      <g class="m26-genie__flame" filter="url(#m26-genie-glow)">
        <path d="M256 43C241 73 218 96 222 127C224 149 239 164 256 174C249 149 254 132 272 115C287 101 291 80 280 54C278 76 269 87 261 99C259 78 264 62 256 43Z" fill="url(#m26-genie-gold)"></path>
        <path d="M253 67C243 92 233 107 236 130C238 145 247 154 255 160C253 142 259 130 268 118C278 106 281 92 275 75C270 91 263 101 258 110C257 96 260 82 253 67Z" fill="#fff7cf" opacity=".82"></path>
        <path d="M246 159C256 145 268 136 281 123" fill="none" stroke="#9c6921" stroke-width="3" opacity=".5"></path>
        <path d="M247 94C252 84 256 75 257 64" fill="none" stroke="#fffbe5" stroke-width="4" stroke-linecap="round" opacity=".52"></path>
      </g>

      <g class="m26-genie__core" filter="url(#m26-genie-glow)">
        <circle cx="256" cy="248" r="32" fill="#071f17" stroke="#e2bc62" stroke-width="3.2"></circle>
        <circle cx="256" cy="248" r="25" fill="url(#m26-genie-core)" opacity=".2"></circle>
        <image href="/public/isotipo-iberfit.png" x="236" y="226" width="40" height="44" preserveAspectRatio="xMidYMid meet" opacity=".98"></image>
        <circle cx="256" cy="248" r="36" fill="none" stroke="#83b49a" stroke-width="2" opacity=".24"></circle>
      </g>

      <g class="m26-genie__beam" filter="url(#m26-genie-glow)">
        <path d="M370 331C409 320 453 295 498 259" fill="none" stroke="#ffe8a7" stroke-width="4" stroke-linecap="round"></path>
        <path d="M380 337C420 329 459 309 488 286" fill="none" stroke="#7eb196" stroke-width="2" stroke-linecap="round" opacity=".4"></path>
        <circle cx="498" cy="259" r="6" fill="#fff8d6"></circle>
      </g>

      <g class="m26-genie__particles" fill="#f4d77d" filter="url(#m26-genie-glow)">
        <circle cx="181" cy="146" r="3"></circle><circle cx="332" cy="145" r="3"></circle>
        <circle cx="160" cy="188" r="2.5"></circle><circle cx="352" cy="187" r="2.5"></circle>
        <circle cx="194" cy="111" r="2"></circle><circle cx="317" cy="106" r="2"></circle>
        <path d="M202 128l3 7l7 3l-7 3l-3 7l-3-7l-7-3l7-3Z"></path>
        <path d="M311 128l3 7l7 3l-7 3l-3 7l-3-7l-7-3l7-3Z"></path>
      </g>

      <g class="m26-genie__alert" filter="url(#m26-genie-glow)">
        <circle cx="407" cy="164" r="23" fill="#0a2e23" stroke="#ffbf00" stroke-width="4"></circle>
        <path d="M407 151v17M407 180v2" stroke="#ffd65e" stroke-width="5" stroke-linecap="round"></path>
      </g>
    </g>
  </svg>`;
}

export const __clientGenieVisualInternals=Object.freeze({
  stateNames:Object.freeze(['idle','pointing','success','alert']),
});
