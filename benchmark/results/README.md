Este directorio almacenará los resultados generados automáticamente por el experimento.

Los archivos generados son ignorados por Git (.gitignore) ya que son específicos de cada equipo.

ARCHIVOS GENERADOS AUTOMÁTICAMENTE:
- metricas_monolith_YYYYMMDD_HHMMSS.csv    → CPU y RAM del Monolito (muestreo cada 1s)
- metricas_microservices_YYYYMMDD_HHMMSS.csv → CPU y RAM de Microservicios
- 01-smoke-test_monolith_*.json            → Resultados Smoke Test
- 02-load-test_monolith_*.json             → Resultados Carga Escalonada
- 03-stress-contention_monolith_*.json     → Resultados Contención (Anti-overbooking)
- 04-resilience_monolith_*.json            → Resultados Resiliencia

Coloca aquí capturas de pantalla o tablas generadas al momento de la sustentación.
