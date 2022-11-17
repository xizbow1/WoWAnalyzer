import SPELLS from 'common/SPELLS';
import { TALENTS_MONK } from 'common/TALENTS';
import Analyzer, { Options, SELECTED_PLAYER } from 'parser/core/Analyzer';
import Events, {
  ApplyBuffEvent,
  HealEvent,
  RefreshBuffEvent,
  RemoveBuffEvent,
} from 'parser/core/Events';
import Combatants from 'parser/shared/modules/Combatants';
import HotTracker, { Attribution } from 'parser/shared/modules/HotTracker';
import {
  isFromHardcast,
  isFromMistyPeaks,
  isFromRapidDiffusion,
  isFromMistsOfLife,
  isFromDancingMists,
} from '../../normalizers/CastLinkNormalizer';
import HotTrackerMW from '../core/HotTrackerMW';

const debug = false;
const remDebug = true;
const rdDebug = true;
const dmDebug = true;

class HotAttributor extends Analyzer {
  static dependencies = {
    hotTracker: HotTrackerMW,
    combatants: Combatants,
  };

  protected combatants!: Combatants;
  protected hotTracker!: HotTrackerMW;
  bouncedAttrib = HotTracker.getNewAttribution('Bounced');
  envMistHardcastAttrib = HotTracker.getNewAttribution('Enveloping Mist Hardcast');
  envMistMistyPeaksAttrib = HotTracker.getNewAttribution('Enveloping Mist Misty Peaks Proc');
  rapidDiffusionAttrib = HotTracker.getNewAttribution('Renewing Mist Rapid Diffusion');
  REMHardcastAttrib = HotTracker.getNewAttribution('Renewing Mist Hardcast');
  MistsOfLifeAttrib = HotTracker.getNewAttribution('Mists of Life');
  dancingMistAttrib = HotTracker.getNewAttribution('Dancing Mist Proc');
  EFAttrib = HotTracker.getNewAttribution('Essence Font Hardcast');

  constructor(options: Options) {
    super(options);
    this.addEventListener(
      Events.applybuff.by(SELECTED_PLAYER).spell(SPELLS.RENEWING_MIST_HEAL),
      this.onApplyRem,
    );
    this.addEventListener(
      Events.applybuff.by(SELECTED_PLAYER).spell(TALENTS_MONK.ENVELOPING_MIST_TALENT),
      this.onApplyEnvm,
    );
    this.addEventListener(
      Events.applybuff.by(SELECTED_PLAYER).spell([SPELLS.ESSENCE_FONT_BUFF]),
      this.onApplyEF,
    );
    this.addEventListener(
      Events.removebuff.by(SELECTED_PLAYER).spell(SPELLS.RENEWING_MIST_HEAL),
      this.onRemoveRem,
    );
  }

  onRemoveRem(event: RemoveBuffEvent) {
    remDebug &&
      console.log(
        'Removed rem from ' +
          this.combatants.getEntity(event)?.name +
          ' at ' +
          this.owner.formatTimestamp(event.timestamp, 3),
      );
  }

  onApplyRem(event: ApplyBuffEvent | RefreshBuffEvent) {
    if (this._hasAttribution(event)) {
      remDebug && this._existingReMAttributionLogging(event);
      return;
    } else if (isFromMistsOfLife(event)) {
      remDebug && this._newReMAttributionLogging(event, this.MistsOfLifeAttrib);
      this.hotTracker.addAttributionFromApply(this.MistsOfLifeAttrib, event);
    } else if (event.prepull || isFromHardcast(event)) {
      remDebug && this._newReMAttributionLogging(event, this.REMHardcastAttrib);
      this.hotTracker.addAttributionFromApply(this.REMHardcastAttrib, event);
    } else if (isFromRapidDiffusion(event)) {
      rdDebug && this._newReMAttributionLogging(event, this.rapidDiffusionAttrib);
      this.hotTracker.addAttributionFromApply(this.rapidDiffusionAttrib, event);
      this.hotTracker.hots[event.targetID][event.ability.guid].maxDuration = Number(
        this.hotTracker.hotInfo[event.ability.guid].procDuration,
      );
      this.hotTracker.hots[event.targetID][event.ability.guid].end =
        event.timestamp + Number(this.hotTracker.hotInfo[event.ability.guid].procDuration);
    } else if (isFromDancingMists(event)) {
      dmDebug && this._newReMAttributionLogging(event, this.dancingMistAttrib);
      //if no other attribution, it HAS to be a dancing mist proc
      this.hotTracker.addAttributionFromApply(this.dancingMistAttrib, event);
    }
  }

  onApplyEnvm(event: ApplyBuffEvent | RefreshBuffEvent) {
    if (this._hasAttribution(event)) {
      return;
    } else if (isFromMistsOfLife(event)) {
      debug &&
        console.log(
          'Attributed Enveloping Mist from Mists of Life at ' +
            this.owner.formatTimestamp(event.timestamp),
          'on ' + this.combatants.getEntity(event)?.name,
        );
      this.hotTracker.addAttributionFromApply(this.MistsOfLifeAttrib, event);
    } else if (event.prepull || isFromHardcast(event)) {
      this.hotTracker.addAttributionFromApply(this.envMistHardcastAttrib, event);
      debug &&
        console.log(
          'Attributed Enveloping Mist hardcast at ' +
            this.owner.formatTimestamp(event.timestamp, 3),
          'on ' + this.combatants.getEntity(event)?.name,
        );
    } else if (isFromMistyPeaks(event)) {
      debug &&
        console.log(
          'Attributed Misty Peaks Enveloping Mist at ' +
            this.owner.formatTimestamp(event.timestamp, 3),
          'on ' + this.combatants.getEntity(event)?.name,
        );
      this.hotTracker.addAttributionFromApply(this.envMistMistyPeaksAttrib, event);
      this.hotTracker.hots[event.targetID][event.ability.guid].maxDuration = Number(
        this.hotTracker.hotInfo[event.ability.guid].procDuration,
      );
    }
  }

  onApplyEF(event: ApplyBuffEvent | RefreshBuffEvent) {
    this.hotTracker.addAttributionFromApply(this.EFAttrib, event);
  }

  _hasAttribution(event: ApplyBuffEvent | HealEvent | RefreshBuffEvent | RemoveBuffEvent) {
    const spellId = event.ability.guid;
    const targetId = event.targetID;
    if (!this.hotTracker.hots[targetId] || !this.hotTracker.hots[targetId][spellId]) {
      return;
    }
    return this.hotTracker.hots[targetId][spellId].attributions.length > 0;
  }

  _existingReMAttributionLogging(event: ApplyBuffEvent | RefreshBuffEvent) {
    if (
      this.hotTracker.hots[event.targetID][event.ability.guid].attributions[0].name ===
      'Renewing Mist Hardcast'
    ) {
      console.log(
        'Bounce! Existing ' +
          this.hotTracker.hots[event.targetID][event.ability.guid].attributions[0].name +
          ' at ' +
          this.owner.formatTimestamp(event.timestamp, 3),
        'on ' + this.combatants.getEntity(event)?.name,
      );
    } else if (
      this.hotTracker.hots[event.targetID][event.ability.guid].attributions[0].name ===
      'Renewing Mist Rapid Diffusion'
    ) {
      console.log(
        'Bounce! Existing ' +
          this.hotTracker.hots[event.targetID][event.ability.guid].attributions[0].name +
          ' at ' +
          this.owner.formatTimestamp(event.timestamp, 3),
        'on ' + this.combatants.getEntity(event)?.name,
      );
    }
  }

  _newReMAttributionLogging(event: ApplyBuffEvent | RefreshBuffEvent, attribution: Attribution) {
    switch (attribution) {
      case this.REMHardcastAttrib: {
        console.log(
          'Hardcast Renewing Mist at ' + this.owner.formatTimestamp(event.timestamp, 3),
          'on ' + this.combatants.getEntity(event)?.name,
        );
        break;
      }
      case this.rapidDiffusionAttrib: {
        console.log(
          ' Rapid Diffusion Renewing Mist at ' + this.owner.formatTimestamp(event.timestamp, 3),
          'on ' + this.combatants.getEntity(event)?.name,
          ' expected expiration: ' +
            this.owner.formatTimestamp(
              event.timestamp + Number(this.hotTracker.hotInfo[event.ability.guid].procDuration),
              3,
            ),
        );
        break;
      }
      case this.MistsOfLifeAttrib: {
        console.log(
          'Attributed Renewing Mist from Mists of Life at ' +
            this.owner.formatTimestamp(event.timestamp),
          'on ' + this.combatants.getEntity(event)?.name,
        );
        break;
      }
      case this.dancingMistAttrib: {
        console.log(
          'Dancing Mist Renewing Mist at ' + this.owner.formatTimestamp(event.timestamp, 3),
          'on ' + this.combatants.getEntity(event)?.name,
        );
        break;
      }
    }
  }
}

export default HotAttributor;
