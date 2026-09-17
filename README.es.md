# Power Bars Card

[![hacs][hacs-badge]][hacs-url]
[![release][release-badge]][release-url]
[![license][license-badge]](LICENSE)

Una tarjeta Lovelace para Home Assistant que muestra muchos sensores numéricos
como barras horizontales compactas, en el espacio que antes ocupaban tres gauges.

*[Read in English](README.md)*

---

![La tarjeta en modo Ahora](https://raw.githubusercontent.com/tsmithf2020/power-bars-card/master/docs/es-ahora.png)

## Por qué existe

Tenía 24 sensores de potencia en un panel, como gauges de a tres por fila. En
cualquier momento, 18 de ellos marcaban 0 W. Ocupaban unos 1000 px de alto para
no decir casi nada, y los que importaban quedaban abajo, fuera de la pantalla.

Ahora los mismos 24 sensores caben en unos 300 px, ordenados para que lo que de
verdad está consumiendo quede arriba en su grupo.

## Qué la hace distinta

Ya hay varias tarjetas de barras buenas (ver [Otras tarjetas](#otras-tarjetas)).
Estas tres cosas no las encontré en ninguna otra:

**Cada grupo tiene su propia escala.** Un automático general de 9900 W y un
enchufe de 8 W en standby caben en la misma tarjeta, sin que el chico quede como
una rayita invisible.

**El total puede ser una entidad, no una suma.** Si tus circuitos están anidados
(un medidor general y los circuitos que cuelgan de él), sumar todas las filas
cuenta la misma energía dos o tres veces. Apunta `total` al medidor que de verdad
sabe.

**`sort: active` no revuelve la lista.** Todas las tarjetas que encontré dejan el
orden de la configuración u ordenan por valor, de mayor a menor. Ordenar por
valor rebaraja la lista entera cada vez que cualquier lectura se mueve un watt.
`active` sube las filas que están *encendidas* (ordenadas entre ellas) y deja las
apagadas justo donde las escribiste. Así, solo un cambio de estado mueve algo.

## Instalación

### HACS (recomendado)

1. HACS → Frontend → ⋮ → **Repositorios personalizados**
2. Agrega `https://github.com/tsmithf2020/power-bars-card` con la categoría **Dashboard**
3. Instala **Power Bars Card** y recarga el navegador

### Manual

Copia `power-bars-card.js` a `<config>/www/power-bars-card/` y agrega el recurso:

```yaml
url: /local/power-bars-card/power-bars-card.js
type: module
```

### Actualizar desde 1.x

La 2.0 cambia tres valores por defecto. No se rompe nada, pero la tarjeta se ve
distinta:

| | 1.x | 2.0 | Para mantener lo de antes |
|---|---|---|---|
| Diseño de la fila | nombre, barra y valor en una línea | nombre y valor arriba, barra a todo el ancho abajo | `layout: inline` |
| Orden | `value` | `active` | `sort: value` |
| Color de la barra con escala automática | verde / amarillo / rojo | el color principal del tema | pon `max` o `severity` |

Los colores cambiaron porque, con escala automática, la fila mayor siempre queda
al 100% y salía siempre roja, consumiera lo que consumiera. El verde, el amarillo
y el rojo vuelven apenas la escala es fija (`max` en la tarjeta, el grupo o la
fila) o escribes `severity`.

## Inicio rápido

```yaml
type: custom:power-bars-card
title: Consumos
entities:
  - sensor.main_power
  - sensor.first_floor_power
  - sensor.kitchen_power
```

Hay un **editor visual** que también maneja grupos y modos (**Usar grupos**,
**+ Agregar grupo**, **+ Agregar modo**). Si no quieres, nunca tienes que tocar
YAML. El editor sigue el idioma de tu Home Assistant: español para `es` e inglés
para todo lo demás. La tarjeta también.

El selector de entidades de Home Assistant no deja reordenar lo que ya tiene. Por
eso, con `sort: active` o `sort: config`, el editor muestra las filas como una
lista que **arrastras por el ícono ⠿** (al pasar el mouse dice «Arrastra para
ordenar»). Funciona con el mouse o con el dedo en la app del celular. Con el
teclado, pon el foco en el ícono y aprieta ↑ o ↓. Mover una entidad no desordena
las demás, y nunca tienes que vaciar la lista y volver a agregar todo en orden.

## Opciones

| Opción | Por defecto | Descripción |
|---|---|---|
| `title` | — | Título de la tarjeta |
| `entities` | — | Lista plana de entidades |
| `groups` | — | Lista de `{name, max, entities, ...}` — ver [Grupos](#grupos) |
| `sort` | `active` | `active`, `value`, `config` o `name` — ver [Orden](#orden) |
| `layout` | `stacked` | `stacked`: «Nombre y valor arriba, barra abajo». `inline`: «Nombre, barra y valor en una línea» |
| `columns` | `1` | `1` o `2`. Vuelve a 1 cuando la tarjeta misma es angosta (menos de 300 px en `stacked`, 400 px en `inline`) |
| `hide_zero` | `false` | Esconde del todo las filas bajo el umbral. Si en un grupo no queda ninguna, dice «nada encendido» |
| `zero_threshold` | `1` | Bajo este valor la fila cuenta como *apagada* (se pinta gris) |
| `show_total` | `true` | Muestra el total arriba a la derecha |
| `total` | `sum` | Entity id del medidor que da el total — ver [Totales](#totales) |
| `max` | auto | Escala de las barras. Sin esto, se usa el mayor valor actual |
| `severity` | `{yellow: 0.5, red: 0.8}` | Umbrales de color — ver [Umbrales](#umbrales). Solo se usa si lo escribes, o si la escala es fija |
| `unit` | la de las entidades | Cambia la unidad que se muestra |
| `modes` | — | Botones en la cabecera que leen las filas de otra forma — ver [Modos](#modos--las-mismas-filas-leídas-de-otra-forma) |
| `billing_day` | `1` | Día del mes en que parte el ciclo de facturación, para `period: billing` (1–31; en los meses más cortos cae en el último día) |
| `name_width` | `8.5em` | Ancho de la columna del nombre, en `layout: inline` |

### Por entidad

En vez de un texto simple, usa un objeto:

```yaml
entities:
  - entity: sensor.fryer_power
    name: Freidora                        # reemplaza el friendly_name
    max: 2200                             # escala solo para esta barra
    color: "#8e44ad"                      # color fijo, ignora severity
    severity: {yellow: 1000, red: 1800}   # sus propios umbrales
    zero_threshold: 10                    # cuándo esta fila se pinta gris
    energy: sensor.fryer_energy           # lo que lee un modo con `key: energy`
```

## Grupos

Cada grupo tiene su propio título **y su propia escala**:

```yaml
type: custom:power-bars-card
title: Consumos
sort: active
columns: 2
total: sensor.main_power
groups:
  - name: General
    max: 9900
    entities: [sensor.main_power]
  - name: Primarios
    max: 5500
    entities: [sensor.first_floor, sensor.second_floor, sensor.terrace]
  - name: Secundarios
    max: 2500
    entities: [sensor.fryer_power, sensor.microwave_power, sensor.dishwasher_power]
```

Claves de un grupo: `name`, `max`, `entities`, `severity`, `zero_threshold`,
`in_total`.

`entities` y `groups` pueden ir juntos: las entidades sueltas se muestran como un
último grupo sin nombre.

## Totales

Por defecto el total es la **suma de las filas** (al pasar el mouse sobre el
total dice «Suma de las filas»). Eso solo está bien cuando los circuitos son
independientes. En un árbol anidado:

```
General  ──>  Primarios  ──>  Secundarios
```

el medidor general ya incluye todo lo que cuelga de él. Apunta el total a ese
medidor:

```yaml
total: sensor.main_power
```

La entidad del total **no tiene que ser una de las filas**. Puede ser un sensor
que ni siquiera se muestra.

Otra opción es mantener la suma, pero sacar un grupo de ella:

```yaml
groups:
  - name: Primarios
    entities: [...]
  - name: Secundarios
    in_total: false     # cuelgan de Primarios, no se cuentan dos veces
    entities: [...]
```

## Orden

| Opción | Comportamiento |
|---|---|
| `active` | Las filas encendidas suben al principio de su grupo, ordenadas por valor. **Las apagadas mantienen el orden en que las escribiste.** |
| `value` | Todo ordenado por valor, de mayor a menor |
| `config` | Exactamente el orden en que lo escribiste |
| `name` | Alfabético |

En el editor visual se llaman «Encendidas primero (las apagadas quedan en mi
orden)», «Por valor (mayor primero)», «Mi propio orden (el de la lista)» y «Por
nombre».

El orden siempre se aplica **dentro de cada grupo**, nunca entre grupos.

`active` es el valor por defecto desde la 2.0. Con `value`, un refrigerador que
se prende y se apaga reordena media tarjeta. Con `active`, solo se mueve el
refrigerador.

## Umbrales

Son dos, y los dos se pueden fijar en **tres niveles: entidad, grupo y tarjeta**.
Gana el más específico.

### `zero_threshold` — el gris

Bajo este valor la fila se pinta gris, y `hide_zero` la saca del todo. Sirve para
ignorar el consumo en standby de los enchufes inteligentes.

```yaml
zero_threshold: 5                 # toda la tarjeta
groups:
  - name: Primarios
    zero_threshold: 20            # este grupo
    entities:
      - entity: sensor.fridge
        zero_threshold: 2         # esta fila
```

### `severity` — los colores

Se puede escribir de dos formas, y la tarjeta las distingue sola:

| Se escribe así | Se lee como |
|---|---|
| `{yellow: 0.5, red: 0.8}` | **Fracción** del máximo de esa barra |
| `{yellow: 1000, red: 1800}` | Valores **absolutos** |

La regla se decide para el objeto **completo**: si todos los números que
escribiste son ≤ 1, son fracciones; si no, todos son valores absolutos. Por eso
`{yellow: 1, red: 3}` en un modo en kWh significa 1 kWh y 3 kWh, no «100% de la
escala y 3 kWh». Para dejarlo explícito, escribe un porcentaje:
`{yellow: "50%", red: 3}`. Un `%` siempre es una fracción del máximo de la barra.

```yaml
severity: {yellow: 0.5, red: 0.8}           # tarjeta, como fracción
groups:
  - name: Secundarios
    severity: {yellow: 800, red: 1500}      # grupo, en watts
    entities:
      - entity: sensor.fryer_power
        severity: {yellow: 1200, red: 2000} # fila, en watts
```

`max` acepta un número o la palabra `auto`. En un **modo**, dejarlo en blanco
significa «usa lo que diga el grupo», y `auto` significa «ajusta a la fila
mayor». Eso último suele ser lo que quieres cuando el modo cambia la magnitud,
porque una escala en watts no significa nada en kWh.

**Cuándo se aplican los colores.** Con `max` automático, la fila mayor siempre
está al 100% de la escala, así que un color basado en esa fracción no dice nada:
antes salía siempre rojo. Desde la 2.0 las barras usan el color principal del
tema, salvo que la escala sea fija (`max` en la tarjeta, el grupo o la fila) o
que escribas `severity` en alguna parte. El `color` propio de una fila siempre
gana.

## Modos — las mismas filas, leídas de otra forma

Un modo pone un botón en la cabecera. Cada modo resuelve cada fila a una
**entidad distinta**, así la misma tarjeta puede mostrar watts en vivo o kWh de un
período.

```yaml
type: custom:power-bars-card
title: Consumos
billing_day: 10                  # el ciclo de facturación parte el día 10
total: sensor.main_power
modes:
  - name: Ahora                  # sin regla: lee la entidad tal como está escrita
  - name: Mes 10-10
    period: billing              # suma el ciclo de facturación en curso
    key: energy                  # la clave `energy:` de cada fila
    unit: kWh
    max: auto
    total: sensor.main_energy
entities:
  - entity: sensor.fryer_power
    energy: sensor.fryer_energy
```

### De dónde saca la entidad un modo

| Clave | Comportamiento |
|---|---|
| ninguna | Usa la `entity` de la fila |
| `key: energy` | Usa la clave `energy:` de la fila |
| `replace: ["_power", "_energy"]` | La deriva del entity id |

`key` le gana a `replace`. **Si un modo tiene regla y una fila no la cumple, la
fila sale como no disponible: no vuelve a la entidad base.** Volver a la base
metería watts en una columna de kWh sin que se note, y eso es peor que un hueco a
la vista. Al pasar el mouse, el tooltip dice qué entidad falta.

La misma tarjeta, cambiada al modo del ciclo de facturación (**Mes 10-10**):
las mismas filas, leídas en kWh en vez de watts y ordenadas por lo que gastó cada
una en el ciclo:

![La tarjeta en modo Mes 10-10](https://raw.githubusercontent.com/tsmithf2020/power-bars-card/master/docs/es-mes.png)

Dos filas muestran un `—` gris y una barra vacía, solo con el borde, porque esos
enchufes no tienen sensor de energía. Es a propósito: un hueco a la vista es
mejor que mostrar sus watts, sin avisar, en una columna de kWh. Pasa el mouse
sobre el nombre para ver qué entidad falta.

Aquí las barras usan el color del tema porque este modo pone `max: auto`. El modo
**Ahora**, más arriba, mantiene el verde, amarillo y rojo porque sus grupos tienen
un `max` fijo.

### Períodos

| `period` | Lee |
|---|---|
| *(sin definir)* | El estado actual de la entidad |
| `today` | El total desde medianoche |
| `month` | El total del mes calendario |
| `billing` | El total desde el último `billing_day` |

Un modo con `period` no lee el estado de la entidad. Suma las estadísticas de la
ventana, la misma fuente que usa el panel de Energía. Así no necesitas un
`utility_meter` por enchufe ni esperar a que se acumulen datos, siempre que el
sensor ya guarde estadísticas (`state_class: total` o `total_increasing`). Las
horas cerradas salen de las estadísticas de largo plazo y la hora en curso, de
las de 5 minutos. Por eso el número nunca va una hora atrasado.

Las estadísticas se piden una vez al abrir el modo y de nuevo cada 5 minutos,
nunca en cada cambio de estado. Si la consulta falla, la cabecera dice *sin
datos* (el error está en su tooltip) y reintenta a los 15 s, 30 s, 60 s… hasta
10 minutos. Mientras un modo carga, la cabecera dice *cargando…* y las filas
muestran `…`, en vez de los números de otro período.

Una fila cuyo sensor de energía existe, pero todavía no tiene nada en la ventana
(justo después de medianoche, o un enchufe nuevo), muestra `0`. Una fila cuyo
sensor no es un contador de energía muestra `—`.

`billing_day: 10` significa que el ciclo va del 10 al 10. Un día 5, el ciclo en
curso partió el 10 del mes *anterior*. Los días se cuentan en la zona horaria que
Home Assistant usa para ti: la del servidor si tu perfil lo indica, y si no, la
del navegador.

### Un modo le gana a todo

`max`, `unit`, `severity` y `zero_threshold` puestos en un modo **le ganan a la
tarjeta, al grupo y a la entidad**. Cambió la magnitud: una escala de 9900 W y un
umbral de 5 W no significan nada cuando la columna está en kWh.

Por lo mismo, un modo que lee **otras entidades** (`key`, `replace` o `period`)
no hereda `total`, `severity` ni `zero_threshold` de la tarjeta, el grupo o la
fila. Sin su propio `total`, suma las filas. Sin su propio `zero_threshold`,
cualquier lectura distinta de cero cuenta como encendida. El editor de modos
tiene campos para los dos: «Medidor del total en este modo» y «Umbral de apagado
en este modo».

### Las unidades se convierten solas

Todas las filas se muestran en una sola unidad: la `unit` del modo; si no hay, la
`unit` de la tarjeta; y si tampoco, la unidad de la primera fila. Un enchufe que
reporta `kW` entre filas en `W`, o `Wh` entre filas en `kWh`, se convierte.
Mezclarlos sin avisar dibujaría esa fila con un error de 1000×, y parecería el
mayor (o el menor) consumo de la casa. La etiqueta del total sigue la conversión.
Funciona con `W`/`kW` y `Wh`/`kWh`/`MWh`; cualquier otra unidad queda tal cual.

### Números

Los números usan el formato de tu perfil de Home Assistant (`3.157,5` o
`3,157.5`) y la precisión de la entidad, si le pusiste una en su configuración.
Si no: enteros sin decimales (`8`, no `8,0`), un decimal bajo 10 y dos bajo 0,1.

## Diseño y temas

Por defecto las filas van apiladas: nombre y valor en una línea, y la barra abajo
a todo el ancho. En dos columnas, eso deja cada barra unas cinco veces más ancha
que poner las tres cosas en una línea, casi con el mismo alto. `layout: inline`
vuelve a la fila de una línea.

Las dos columnas pasan a una cuando lo angosto es la **tarjeta**, no la pantalla.
Así, una tarjeta de media pantalla en la vista de secciones igual se lee bien.
Los colores vienen de tu tema, así que funciona en modo claro y oscuro:

![Tema oscuro, tarjeta angosta](https://raw.githubusercontent.com/tsmithf2020/power-bars-card/master/docs/dark.png)

Las filas se pueden usar con el teclado: llega a una fila con Tab y Enter abre su
ventana de más información.

## No solo potencia

Nada en la tarjeta es exclusivo de la electricidad. Sirve cualquier sensor
numérico: presión de agua, uso de disco, humedad, intensidad de señal. El nombre
describe cómo se ve el resultado, no lo que se mide.

## Otras tarjetas

Tarjetas que revisé antes de escribir esta, y lo que cada una hace bien:

- **[bar-card](https://github.com/custom-cards/bar-card)** — la clásica. Muy
  buen estilo por barra y rangos de severidad. Sin grupos, sin orden, sin total,
  sin editor visual; sin mantenimiento desde 2020.
- **[ha-live-power-dashboard](https://github.com/rusty4444/ha-live-power-dashboard)**
  — la más parecida en espíritu. Máximo por circuito o global, editor visual, y
  ordena sola por consumo. Sin grupos con título, sin entidad aparte para el
  total.
- **[entity-progress-card](https://github.com/francois-le-ko4la/lovelace-entity-progress-card)**
  — filas con barra de progreso muy pulidas, una entidad por tarjeta.
- **[energy-devices-power-graph-card](https://github.com/hheimbuerger/lovelace-energy-devices-power-graph-card)**
  — se configura sola a partir de tu panel de Energía.
- **[ha-sankey-chart](https://github.com/MindFreeze/ha-sankey-chart)** — resuelve
  bien el problema de los circuitos anidados, como diagrama en vez de lista
  compacta.

Si alguna de esas te sirve mejor, úsala.

## Desarrollo

```bash
node test/smoke.js
```

Sin dependencias: hay un pequeño shim de DOM dentro del mismo archivo de test. Se
llama de verdad a `_render()` y `_update()` y se revisa el HTML que producen, en
vez de simularlo.

La suite se valida rompiendo la tarjeta a propósito y comprobando que los tests
fallen. Dos hallazgos de ese ejercicio que vale la pena dejar escritos:

- **Los tests de color estaban mal al principio.** Buscaban `--pbc-yellow` con un
  `includes()` sobre todo el HTML, y ese texto ya aparece en el bloque `<style>`
  donde se definen las variables. Pasaban siempre, pasara lo que pasara. Ahora
  leen el `style` inline de cada barra.
- **`sort: active` necesitó una búsqueda a la fuerza.** Borrar la línea que
  separa encendidas de apagadas no cambiaba nada en ningún test: en todos, todo
  lo encendido valía más que todo lo apagado, así que el comparador roto acertaba
  por suerte. Una búsqueda aleatoria sobre 200.000 listas encontró que difieren en
  el 0,18% de los casos, siempre con la misma forma: una **fila encendida con
  valor bajo**, que solo existe porque los umbrales son por entidad. Ese caso es
  el test 38a.

El mismo ejercicio sobre los modos y períodos detectó seis más: volver a la
entidad base cuando una regla no calza, una ventana de facturación que nunca
retrocede un mes, un `max` de modo que no le gana al del grupo, estadísticas que
se sobrescriben en vez de sumarse, nombres tomados del sensor de energía en vez
del sensor base, y un primer modo que no es neutro.

Un hueco conocido: calcular la escala sobre las filas visibles en vez del grupo
completo **no lo detecta ningún test**. Hoy no se puede distinguir (`hide_zero`
solo saca valores chicos, y el máximo nunca es uno de ellos) y está anotado en el
test 14 para que nadie lo tome como una garantía.

## Licencia

MIT

[hacs-badge]: https://img.shields.io/badge/HACS-Custom-41BDF5.svg
[hacs-url]: https://github.com/hacs/integration
[release-badge]: https://img.shields.io/github/v/release/tsmithf2020/power-bars-card
[release-url]: https://github.com/tsmithf2020/power-bars-card/releases
[license-badge]: https://img.shields.io/badge/license-MIT-blue.svg
