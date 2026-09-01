-- Wachtelaer Veldapp — adds "opstart_warmtepomp" (indienststelling van een
-- lucht/water warmtepompinstallatie) to the formulieren module.

alter table formulieren drop constraint formulieren_formulier_check;

alter table formulieren add constraint formulieren_formulier_check
  check (
    formulier in (
      'onderhoud_airco',
      'onderhoud_ventilatie',
      'recuperatie_koelmiddel',
      'druktest_leidingen',
      'opstart_airco',
      'opstart_warmtepomp'
    )
  );
