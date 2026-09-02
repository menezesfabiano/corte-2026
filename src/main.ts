import "./estilo.css";
import { registerSW } from "virtual:pwa-register";
import { iniciar } from "./ui/app.ts";

// service worker: cache dos assets e do plano, atualiza sozinho na proxima abertura
registerSW({ immediate: true });

iniciar();
