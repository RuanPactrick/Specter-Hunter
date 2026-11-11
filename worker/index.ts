import { runQueue, stopWorker } from "../src/lib/worker-run";
process.on("SIGINT",stopWorker);
process.on("SIGTERM",stopWorker);
// WORKER_ONCE=1: esvazia a fila e encerra; WORKER_MAX_MINUTES limita a rodada. Sem WORKER_ONCE, fica esperando itens novos.
const once=process.env.WORKER_ONCE==="1";
console.log("Worker Specter Hunter iniciado."+(once?" Modo rodada única: encerra quando a fila esvaziar.":" Esperando itens na fila."));
runQueue(once?{until:Date.now()+Number(process.env.WORKER_MAX_MINUTES??20)*60000}:{forever:true})
  .then(done=>console.log("Fila vazia. "+done+" itens processados nesta rodada."))
  .catch(error=>{console.error("Worker parou:",error instanceof Error?error.message:String(error));process.exitCode=1;});
