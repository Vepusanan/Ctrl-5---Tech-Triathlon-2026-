import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/waypoint';
import { api, message, noContent } from '../../lib/api';
import { replaceSession } from '../../lib/session';
import { initials } from '../store/shared';
import { ActionBar, LoaderIcon, PageHead, SharedIcon, shortName } from './shell';
import { useLoader } from './workspace';

// L07. The tablet is shared. Switching signs this loader out (POST /auth/logout); the next person
// signs in with their own account, so everything they record is saved under their name.
export function SwitchUser() {
  const { user } = useLoader();
  const navigate = useNavigate();
  const client = useQueryClient();
  const signOut = useMutation({
    mutationFn: () => api('/auth/logout', noContent, { method: 'POST' }),
    onSuccess: () => replaceSession(client, null),
  });
  return (
    <>
      <PageHead
        title="Who is using this tablet?"
        detail={`${user.depotId} · everything you record is saved under your name`}
      />
      <div className="loader-split">
        <section className="loader-card loader-people" aria-label="Signed in">
          <h2 className="loader-card-title">
            <LoaderIcon name="user" size={18} />
            On this tablet
          </h2>
          <div className="loader-people-grid">
            <div className="loader-person loader-person--current">
              <span className="loader-avatar loader-avatar--large">{initials(user.name)}</span>
              <strong>{shortName(user.name)}</strong>
              <span>Signed in · loader</span>
            </div>
            <button
              type="button"
              className="loader-person loader-person--other"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              <span className="loader-round loader-round--muted">
                <LoaderIcon name="plus" size={24} />
              </span>
              <strong>Someone else</strong>
              <span>Sign out and hand over</span>
            </button>
          </div>
          <p className="loader-note loader-note--info">
            <SharedIcon src="54-30-imgIconInfo" size={16} />
            Loads you started stay recorded under your name.
          </p>
        </section>
        <section className="loader-dark loader-consequences" aria-label="Switching">
          <strong>When you switch</strong>
          <ul>
            <li>
              <span className="loader-dark-icon">
                <SharedIcon src="54-30-imgIconLock" size={14} />
              </span>
              You are signed out of this tablet
            </li>
            <li>
              <span className="loader-dark-icon">
                <LoaderIcon name="user" size={18} />
              </span>
              The next person signs in with their own account
            </li>
          </ul>
        </section>
      </div>
      {signOut.error && (
        <div className="loader-banner loader-banner--danger" role="alert">
          <strong>Not signed out</strong>
          <p>{message(signOut.error)}</p>
        </div>
      )}
      <ActionBar
        status={
          <p className="loader-status-line">
            <SharedIcon src="54-30-imgIconLock" size={14} />
            Sign out before you hand the tablet over.
          </p>
        }
      >
        <Button
          variant="secondary"
          className="loader-cta"
          disabled={signOut.isPending}
          onClick={() => navigate(-1)}
        >
          Cancel
        </Button>
        <Button className="loader-cta" busy={signOut.isPending} onClick={() => signOut.mutate()}>
          Switch user
        </Button>
      </ActionBar>
    </>
  );
}
