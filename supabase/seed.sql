-- Content for El Gran Scavenger Hunt de Bogotá (2026-10-03). Re-runnable: upserts stops/sides, inserts teams once.
-- The admin passcode hash is set separately (never committed):
--   insert into hunt.config(id, admin_hash) values (1, '<sha256 hex of passcode>') on conflict (id) do update set admin_hash = excluded.admin_hash;

insert into hunt.stops (n, name, clue, ask, proof, hint, qm, finish, lat, lng, radius, answer_words) values
(1, 'Plaza de Bolívar', $q$En la plaza más importante,
levanten los ojos
para copiar una frase.$q$, 'Escriban la frase del Palacio de Justicia', 'phrase',
 'El Palacio de Justicia, en el costado norte de la plaza. La frase está grabada en la fachada.', null, false, 4.59819, -74.076053, 250, '{armas,leyes,libertad}'),
(2, 'Museo Botero', $q$Un ladrón en el gobierno,
un ladrón en el banco,
un ladrón en el techo,
¡qué escándalo!

Los dos primeros se encuentran todos los días,
el último, pintado por un famoso,
¿dónde lo verías?$q$, 'Selfie del equipo con el Ladrón', 'photo',
 'Calle 11 con Carrera 4, La Candelaria. La entrada es gratis.', null, false, 4.596698, -74.07335, 250, null),
(3, 'Policarpa, Las Aguas', $q$La pola toma su nombre
de una chica y no de un hombre.
Al lado de los Andes y Las Aguas,
rendimos homenaje a Policarpa.$q$, 'Nota de voz leyendo la inscripción de la cara norte', 'voice',
 'Avenida Jiménez con Carrera 3, frente a la Universidad de los Andes.', null, false, 4.6027, -74.0685, 400, null),
(4, 'Quinta de Bolívar', $q$Nacido en Venezuela, muerto en Colombia,
entre esas dos cosas, liberó cuatro otras.
Pero no busca cuatro, sino un número más:
una casa y un jardín,
¿a dónde te vas?$q$, 'Selfie en la casa + trivia con un quizmaster', 'photo',
 'La casa de campo de Bolívar, al pie de Monserrate.', 'Busquen a Ross en la entrada. Trivia: universidades y localidades.', false, 4.6004, -74.0641, 400, null),
(5, 'Plaza La Perseverancia', $q$Presidentes, un autor y una pintora.
En el billete de $2.000 aparece ______.
En el mismo billete, al otro lado, un vecindario con una plaza
donde venden ajiaco.

Compren uno, cómanlo
y mándennos una selfie con el plato vacío.$q$, 'Selfie con el plato de ajiaco vacío', 'photo',
 'La pintora es Débora Arango. El mercado que buscan está en el barrio La Perseverancia.', null, false, 4.616465, -74.066279, 250, null),
(6, 'Matorral / Diosa, Teusaquillo', $q$En La Macarena el arquitecto puso tres torres,
donde sus residentes han vivido mil historias.
Al frente, una librería verde contiene mil más,
pero esta librería tiene otra sede.

Encuéntrenla para que procedan.$q$, 'Selfie del equipo en la librería', 'photo',
 'La librería verde frente a las Torres del Parque se llama Matorral. Su otra sede está en Teusaquillo, con Diosa Cervecería.', null, false, 4.625927, -74.073444, 250, null),
(7, 'Casa de Betty la Fea', $q$Cambiamos de libros a la televisión.
Un personaje famoso en ese vecindario tenía su habitación.
Vayan a visitarla, la de gafas y brackets,
y tomen una foto donde ella existía.$q$, 'Foto recreando una pose de Betty', 'photo',
 'Carrera 18A # 43A-59, Teusaquillo.', null, false, 4.6330, -74.0725, 400, null),
(8, 'Biblioteca Virgilio Barco', $q$Salmona no solo diseñó apartamentos,
también diseñó un espacio para prestar libros,
en un edificio redondo de ladrillo y con fuente,
nombrado por un presidente
que buscó paz y constituyente.$q$, 'Foto del carné BibloRed + trivia con Julia', 'photo',
 'Dentro del parque Simón Bolívar, Avenida Carrera 60 # 57-60.', 'Julia los espera adentro. Trivia: cuerpos de agua y figuras culturales.', false, 4.6578, -74.0906, 400, null),
(9, 'Theatron', $q$En Bogotá hay catedrales, iglesias y capillas;
la gran mayoría solo abren de día.
Pero hay un lugar de alabanza que se llena de noche,
un templo en Chapinero donde los gays se gozan.$q$, 'Selfie “ilustrativa” afuera (10 pts extra a la más evocativa)', 'photo',
 'La discoteca más famosa de Chapinero, sobre la Calle 58.', null, false, 4.644929, -74.063764, 250, null),
(10, 'FRANC', $q$La última parada es la de siempre,
donde solemos llegar a tomar un vino.$q$, 'Selfie en la puerta. Esta foto detiene su reloj.', 'photo',
 'Carrera 4 Bis # 58-40, Chapinero.', null, true, 4.643281, -74.060122, 250, null)
on conflict (n) do update set name = excluded.name, clue = excluded.clue, ask = excluded.ask, proof = excluded.proof, hint = excluded.hint,
  qm = excluded.qm, finish = excluded.finish, lat = excluded.lat, lng = excluded.lng, radius = excluded.radius, answer_words = excluded.answer_words;

insert into hunt.sides (id, name, place, pts, after_stop, ask, sort) values
('coin', 'La moneda más antigua', 'Casa de Moneda, junto al Botero', 20, 2, 'Foto de la moneda colombiana más antigua en exhibición', 1),
('terminal', 'Una fecha histórica', 'Terminal Salitre', 50, 7, 'Compren el tiquete y mándennos una foto. Guárdenlo: se los pedimos al final.', 2),
('novios', 'Foto de prom', 'Parque de Los Novios', 20, 8, 'Foto en el puente del lago, como si fueran al prom', 3)
on conflict (id) do update set name = excluded.name, place = excluded.place, pts = excluded.pts, after_stop = excluded.after_stop, ask = excluded.ask, sort = excluded.sort;

-- Event teams: departure order is re-randomised on the day from the admin page.
insert into hunt.teams (id, name, color, token, depart, is_test)
select v.id, v.name, v.color, translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'),
       timestamptz '2026-10-03 10:00:00-05' + (v.ord * interval '10 minutes'), false
from (values ('t1','Equipo 1','#CF5436',0), ('t2','Equipo 2','#2E7A57',1), ('t3','Equipo 3','#7A4B2A',2),
             ('t4','Equipo 4','#E4AA2A',3), ('t5','Equipo 5','#3F6FD8',4)) as v(id, name, color, ord)
on conflict (id) do nothing;

-- Test teams: already "departed" so the flow can be tried any time; reset from the admin page.
insert into hunt.teams (id, name, color, token, depart, is_test)
select v.id, v.name, v.color, translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'), now() - interval '1 minute', true
from (values ('prueba-ross','Prueba Ross','#16347F'), ('prueba-julia','Prueba Julia','#8A3FA0')) as v(id, name, color)
on conflict (id) do nothing;

-- Side quest riddles (Julia's); a side quest with a clue never sends its place to teams.
update hunt.sides set clue = $q$Es un Salitre, pero no el mágico,
aquí las esperas se pueden poner trágicos.
Desde acá encontrarás buses hacia cualquier destino,
vayan y compren un tiquete para el departamento vinculado a este datico:

7 de agosto de 1819$q$ where id = 'terminal';

-- Julia's revisions (2026-09-29): clue corrections and her own hints. Applied live; these override the rows above.
update hunt.stops set hint = 'Una fachada en Plaza Bolívar...' where n = 1;
update hunt.stops set clue = $q$Un ladrón en el gobierno,
un ladrón en el banco,
un ladrón en el techo,
¡Ay qué escándalo!

Los dos primeros se encuentran todos los días,
el último, pintado por un famoso,
¿dónde lo verías?$q$, hint = 'Un ladrón corpulento...' where n = 2;
update hunt.stops set clue = $q$La pola toma su nombre
de una chica y no de un hombre.
Al lado de Los Andes y Las Aguas,
rendimos homenaje a Policarpa.$q$, hint = 'Estás buscando una estatua' where n = 3;
update hunt.stops set clue = $q$Nacido en Venezuela, muerto en Colombia,
entre esas dos cosas, liberó cuatro.
Pero no busca cuatro, sino un número más:
una casa y un jardín,
¿a dónde te vas?$q$, hint = '¿El libertador donde durmió?' where n = 4;
update hunt.stops set clue = $q$Presidentes, un autor y una pintora.
En el billete de $2.000 aparece Débora.
En el mismo billete, al otro lado, encontrarán el nombre de un vecindario.
Cerquita de allí, un poco al norte, hay una plaza con ajiaco para que uno devore.$q$,
  hint = '¿Dónde almuerzan los domingos los habitantes de La Macarena?' where n = 5;
update hunt.stops set clue = $q$En La Macarena el arquitecto puso tres torres,
donde sus residentes han vivido mil historias,
al frente, una librería verde contiene otras mil,
pero esta librería tiene otras instalaciones.
Encuéntrenla para que procedan.$q$, hint = '¿Dónde esta el otro sede de Matorral?' where n = 6;
update hunt.stops set clue = $q$Cambiamos de libros a la televisión.
Una personaje famosa en ese vecindario tenía habitación.
Vayan a visitarla, la de gafas y brackets,
y tomen una foto donde ella existía.$q$, hint = '¿Dónde vivía Betty?' where n = 7;
update hunt.stops set clue = $q$Salmona no solo diseñó apartamentos,
también diseñó un espacio para prestar libros.
En un edificio redondo de ladrillo y con fuente,
Nombrado por un presidente que buscó paz y constituyente.$q$, hint = 'La biblioteca de Barco' where n = 8;
update hunt.stops set hint = '¿''La Capilla'' se encuentra en que discoteca?' where n = 9;
update hunt.stops set hint = '''Franc''-ly, we need a drink!' where n = 10;
update hunt.sides set after_stop = 7 where id = 'terminal';
-- Accent/capitalisation fixes (2026-09-29)
update hunt.stops set hint = '¿El Libertador dónde durmió?' where n = 4;
update hunt.stops set hint = '¿Dónde está la otra sede de Matorral?' where n = 6;
update hunt.stops set clue = replace(clue, E'\nNombrado por un presidente', E'\nnombrado por un presidente') where n = 8;
update hunt.stops set hint = '¿''La Capilla'' se encuentra en qué discoteca?' where n = 9;
-- Stop 4 (Julia, 29 Sep): drop "cosas", keep "otras"
update hunt.stops set clue = replace(clue, 'entre esas dos cosas, liberó cuatro.', 'entre esas dos, liberó cuatro otras.') where n = 4;
-- Stop 3: typed inscription (see migration 012)
update hunt.stops set proof = 'phrase', ask = 'Completen la inscripción de La Pola', answer_prefix = 'Aunque mujer y joven,',
  answer_words = '{sobra,valor,sufrir,muerte,libertad}', lat = 4.6026, lng = -74.0668, radius = 400 where n = 3;
-- Challenge wording pass (2026-09-29): short headings (ask) + details in the note (qm)
update hunt.stops as s set ask = v.ask, qm = v.qm from (values
  (1, 'Completen la frase', null),
  (2, 'Selfie con el Ladrón', 'Todo el equipo en la foto, con la obra de Botero.'),
  (3, 'Completen la inscripción', null),
  (4, 'Selfie en la casa', 'Después busquen a Ross en la entrada para la trivia: universidades y localidades de Bogotá.'),
  (5, 'Selfie con el plato vacío', 'Compren un ajiaco, cómanlo entre todos y tómense la selfie con el plato vacío.'),
  (6, 'Selfie en la librería', 'Todo el equipo en la foto, adentro de la librería.'),
  (7, 'Recreen una pose de Betty', 'Foto del equipo frente a la casa. Gafas y brackets opcionales.'),
  (8, 'El carné de BibloRed', 'Afíliense a BibloRed (es gratis, pídanlo en la entrada) y mándennos una foto del carné. Si alguien ya tiene carné, muestren ese. Después busquen a Julia adentro para la trivia: cuerpos de agua y figuras culturales.'),
  (9, 'Selfie ilustrativa', 'Afuera del lugar. La foto más evocativa gana 10 puntos extra.'),
  (10, 'Selfie en la puerta', 'Esta foto detiene su reloj.')
) as v(n, ask, qm) where s.n = v.n;
-- Stop 6 poem (Julia, 29 Sep, second revision)
update hunt.stops set clue = $q$Los habitantes de Bogotá han vivido millones de historias,
una librería verde en La Macarena contiene mil otras.
Esa librería también tiene sede en otro lugar,
encuéntrenla para que continuar.$q$ where n = 6;
-- Text slips (30 Sep): stop 6 grammar, stop 7 feminine noun, stop 1 hint
update hunt.stops set clue = replace(clue, 'encuéntrenla para que continuar.', 'encuéntrenla para continuar.') where n = 6;
update hunt.stops set clue = replace(clue, 'Una personaje famosa en ese vecindario tenía habitación.', 'Una protagonista famosa en ese vecindario tenía habitación.') where n = 7;
update hunt.stops set hint = 'Una fachada en la Plaza de Bolívar…' where n = 1;
