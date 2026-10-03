// D07 · What-if simulator (Figma 2040:3236): a sandbox that never changes the live plan.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banner,
  Button,
  DeltaBadge,
  ErrorState,
  Icon,
  LoadingState,
  Switch,
} from '../../components/waypoint';
import {
  type Lever,
  type ScenarioMetric,
  scenarioAppliedSchema,
  scenarioResultSchema,
  scenarioSetupSchema,
} from './contracts';
import { api, message } from './data/client';
import { CardHead } from './ui';
import { Page, useDispatch } from './workspace';
import './simulate.css';

const leverIcons: Record<Lever['kind'], string> = {
  hire_vehicle: 'truck',
  second_trip: 'refresh',
  remove_vehicle: 'slash',
  shift_cutoff: 'clock',
  demand: 'trend',
};

const SCENARIO = 'Scenario A';
const BAR_HEIGHT = 300;

export function WhatIfSimulator() {
  const { date } = useDispatch();
  const client = useQueryClient();
  const [active, setActive] = useState<readonly string[]>([]);
  const [applied, setApplied] = useState<number | null>(null);
  const setup = useQuery({
    queryKey: ['planning', date, 'scenario'],
    queryFn: () => api(`/planning/runs/${date}/scenario`, scenarioSetupSchema),
  });
  const body = JSON.stringify({ levers: active });
  const result = useQuery({
    queryKey: ['planning', date, 'simulate', active],
    queryFn: () =>
      api(`/planning/runs/${date}/simulate`, scenarioResultSchema, { method: 'POST', body }),
    enabled: active.length > 0,
    placeholderData: (previous) => previous,
  });
  const apply = useMutation({
    mutationFn: () =>
      api(`/planning/runs/${date}/simulate/apply`, scenarioAppliedSchema, {
        method: 'POST',
        body,
      }),
    onSuccess: async (data) => {
      setApplied(data.planVersion);
      setActive([]);
      await client.invalidateQueries({ queryKey: ['planning', date] });
      await client.invalidateQueries({ queryKey: ['dashboard', date] });
    },
  });

  const header = { title: 'What-if simulator', description: 'Try a change before you make it' };
  if (setup.isPending) {
    return (
      <Page {...header}>
        <LoadingState label="Loading the levers…" rows={5} />
      </Page>
    );
  }
  if (!setup.data) {
    return (
      <Page {...header}>
        <ErrorState description={message(setup.error)} onRetry={() => void setup.refetch()} />
      </Page>
    );
  }

  const { planVersion, levers, baseline } = setup.data;
  const plan = `Plan v${planVersion}`;
  const on = active.length > 0;
  const scenario = on ? result.data?.scenario : undefined;
  const cost = on ? result.data?.extraCost : undefined;
  const toggle = (id: string, checked: boolean) => {
    setApplied(null);
    setActive(checked ? [...active, id] : active.filter((item) => item !== id));
  };

  return (
    <Page
      {...header}
      actions={
        <>
          <Button variant="secondary" size="md" disabled={!on} onClick={() => setActive([])}>
            Discard
          </Button>
          <Button
            size="md"
            disabled={!on || !scenario}
            busy={apply.isPending}
            onClick={() => apply.mutate()}
          >
            Copy to draft
          </Button>
        </>
      }
    >
      <Banner title={`Sandbox — live ${plan.toLowerCase()} is not changed`}>
        Nothing here reaches loaders, drivers or stores until you copy it into a draft.
      </Banner>
      {applied !== null && (
        <Banner
          tone="success"
          title={`Scenario copied into draft plan v${applied}`}
          action={
            <Link className="d-link" to={`/dispatcher/validation?date=${date}`}>
              Validate the draft
            </Link>
          }
        >
          Still nothing is published. Validate the draft before you publish.
        </Banner>
      )}
      {(result.isError || apply.isError) && (
        <Banner
          tone="danger"
          title={apply.isError ? 'Not copied to the draft' : 'Simulation failed'}
        >
          {message(apply.error ?? result.error)}
        </Banner>
      )}
      <div className="sim-row">
        <section className="wp-card sim-levers" aria-label="Levers">
          <CardHead title="Levers" icon="sliders" />
          <ul className="wp-list">
            {levers.map((lever) => {
              const checked = active.includes(lever.id);
              return (
                <li key={lever.id} className="sim-lever" data-on={checked || undefined}>
                  <span className="wp-icon-well">
                    <Icon name={leverIcons[lever.kind]} />
                  </span>
                  <span className="sim-lever-text">
                    <strong>{lever.title}</strong>
                    <span>{lever.detail}</span>
                  </span>
                  <Switch
                    label={lever.title}
                    checked={checked}
                    onChange={(next) => toggle(lever.id, next)}
                  />
                </li>
              );
            })}
          </ul>
          <div className="sim-cost">
            <Icon name="fuel" />
            <p>
              Extra cost
              <strong>
                {cost ? `${cost.currency} ${cost.amount.toLocaleString('en-GB')}` : '—'}
              </strong>
            </p>
            {/* More cost is the bad direction, so a rise takes the negative style. */}
            {cost && cost.deltaPercent !== 0 && (
              <DeltaBadge value={cost.deltaPercent} unit="%" bad={cost.deltaPercent > 0} />
            )}
          </div>
        </section>
        <section className="wp-card sim-chart" aria-label={`${plan} against ${SCENARIO}`}>
          <div className="d-head">
            <h2 className="d-title">
              {plan} vs {SCENARIO.toLowerCase()}
            </h2>
            <p className="sim-legend">
              <span>
                <i />
                {plan}
              </span>
              <span>
                <i data-scenario />
                {SCENARIO}
              </span>
            </p>
          </div>
          <div className="sim-groups" aria-busy={result.isFetching}>
            {baseline.map((metric) => (
              <Pair
                key={metric.key}
                metric={metric}
                scenario={scenario?.find((item) => item.key === metric.key)}
                plan={plan}
              />
            ))}
          </div>
          <p className="d-note">
            {on
              ? (result.data?.insight ?? 'Simulating…')
              : 'Turn on a lever to compare a scenario with the live plan.'}
          </p>
        </section>
      </div>
    </Page>
  );
}

/** Two bars for one measure, scaled to the taller of the pair so the gap reads as height. */
function Pair({
  metric,
  scenario,
  plan,
}: {
  metric: ScenarioMetric;
  scenario: ScenarioMetric | undefined;
  plan: string;
}) {
  const peak = Math.max(1, metric.value, scenario?.value ?? 0);
  const height = (value: number) => Math.max(15, Math.round((value / peak) * BAR_HEIGHT));
  const show = (value: number) => `${value}${metric.unit}`;
  return (
    <figure className="sim-pair">
      <div>
        <span className="d-bar-value">{show(metric.value)}</span>
        <span
          className="sim-bar"
          role="img"
          aria-label={`${plan}: ${show(metric.value)}`}
          style={{ height: height(metric.value) }}
        />
      </div>
      {scenario && (
        <div>
          <span className="d-bar-value">{show(scenario.value)}</span>
          <span
            className="sim-bar"
            data-scenario
            role="img"
            aria-label={`${SCENARIO}: ${show(scenario.value)}`}
            style={{ height: height(scenario.value) }}
          />
        </div>
      )}
      <figcaption>{metric.label}</figcaption>
    </figure>
  );
}
