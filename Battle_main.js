function defaultFor(arg, val) {
    return typeof arg !== 'undefined' ? arg : val;
}
var autoFightEnabled = true;
var autoBuyEnabled = true;
var autoQuestEnabled = true;
var autoLevelEnabled = true;
var autoInventoryEnabled = true;
var autoMobLevelUpdateEnabled = true;

var autoFightBot = 0;
var autoFightBotInterval = 0;
var autoBuyBot = 0;
var autoBuyBotInterval = 5000;
var autoLevelBot = 0;
var autoLevelBotInterval = 5000;
var autoInventoryBot = 0;
var autoInventoryBotInterval = 250;
var autoMobLevelUpdateBot = 0;
var autoMobLevelUpdateBotInterval = 10000;

//Currently it is not possible to fight a mob above your level in game, but there's no logic check against it
//If you feel it's cheating to fight higher level mobs, then leave this as true
//Otherwise feel free to set to false
var capMobLevelAtPlayerLevel = true;
var maxMobLevel = 14100;

var mercs = ['footman', 'cleric', 'commander', 'mage', 'assassin', 'warlock'];
var XPFarmLevel = 0;
var lootFarmStep = 0;
var lootFarm = false;
var XPS = 0;
var lastXP = 0;
var maxItemRarity = 9900;

var ABPurchaseType = new Object();

ABPurchaseType.MERCENARY = "MERCENARY";
ABPurchaseType.UPGRADE = "UPGRADE";

var lootFarmRarities = [MonsterRarity.BOSS, MonsterRarity.ELITE];

setTimeout(function() { autoBattleStart(); }, 5000);

function turnOnLoot() {
  if (game.player.effects.filter(function(e){return e.type == 'CRUSHING_BLOWS'}).length == 0) {
    setTimeout(turnOnLoot, 1000);
  } else {
    lootFarm = true;
  }
}

function efficiency() {
  return [{name: 'COMMANDER',
           type: ABPurchaseType.MERCENARY}];
}

function calculateUpgradeEfficiency(type, requirementType, cost) {
    switch (type) {
        case UpgradeType.GPS:
            switch (requirementType) {
                case UpgradeRequirementType.FOOTMAN:
                    return (game.mercenaryManager.footmenOwned * game.mercenaryManager.getMercenariesGps(MercenaryType.FOOTMAN) / cost);
                case UpgradeRequirementType.CLERIC:
                    return (game.mercenaryManager.clericsOwned * game.mercenaryManager.getMercenariesGps(MercenaryType.CLERIC) / cost);
                case UpgradeRequirementType.COMMANDER:
                    return (game.mercenaryManager.commandersOwned * game.mercenaryManager.getMercenariesGps(MercenaryType.COMMANDER) / cost);
                case UpgradeRequirementType.MAGE:
                    return (game.mercenaryManager.magesOwned * game.mercenaryManager.getMercenariesGps(MercenaryType.MAGE) / cost);
                case UpgradeRequirementType.ASSASSIN:
                    return (game.mercenaryManager.assassinsOwned * game.mercenaryManager.getMercenariesGps(MercenaryType.ASSASSIN) / cost);
                case UpgradeRequirementType.WARLOCK:
                    return (game.mercenaryManager.warlocksOwned * game.mercenaryManager.getMercenariesGps(MercenaryType.WARLOCK) / cost);
                default:
                    return 0;
            }
        case UpgradeType.SPECIAL:
            return Number.POSITIVE_INFINITY;
            break;
        case UpgradeType.AUTO_SELL:
            return Number.POSITIVE_INFINITY;
            break;
        case UpgradeType.ATTACK:
            return Number.POSITIVE_INFINITY;
        default:
            return 0;
    }
}


function maxMonsterRarity(level) {
    if (level >= 30) {
        return MonsterRarity.BOSS;
    } else if (level >= 10) {
        return MonsterRarity.ELITE;
    } else {
        return MonsterRarity.RARE;
    }
}

function equipAndSellInventory() {
    game.inventory.slots.forEach(function (i, x) {
        if (i != null) {
            var newSlot = shouldEquip(i);
            if (newSlot == -1) {
                game.inventory.sellItem(x);
            } else {
                game.equipment.equipItemInSlot(i, newSlot, x);
            }
        }
    });
}

function updateMobLevels() {
    var minDamage = getEstimatedDamage();
    minDamage = getMinimumDamage(1);
    var monsterHealth = 0;
    var level = 1;

    while (monsterHealth < minDamage) {
        level++;

        monsterHealth = game.monsterCreator.calculateMonsterHealth(level, MonsterRarity.COMMON);
        minDamage = getMinimumDamage(monsterHealth);
    }
    level--;
    XPFarmLevel = Math.max(1, level);
    XPFarmLevel = Math.min(level, maxMobLevel);
    if (capMobLevelAtPlayerLevel) XPFarmLevel = Math.min(game.player.level, level);
    level = 1;
    while (canFarm(level, maxMonsterRarity(level))) {
    
        level++;
    }
    level--;
    level = Math.min(level, maxMobLevel);
    if (capMobLevelAtPlayerLevel) level = Math.min(game.player.level, level);
    lootFarmStep = level;
}


function canFarm(level, rarity) {
    var baseDamage = game.monsterCreator.calculateMonsterDamage(level, rarity);
    if (attackWillKill(baseDamage, true) || attackWillLoseHP(baseDamage)) {

        return false;
    } else {
        return true;
    }
}

function attackWillLoseHP(baseDamage) {
    var damage = Math.max(0, baseDamage - Math.floor(baseDamage * (game.player.calculateDamageReduction() / 100)));
    var healAmount = game.player.abilities.getRejuvenatingStrikesHealAmount(0) * (game.player.attackType == AttackType.DOUBLE_STRIKE ? 2 : 1);
    return damage > healAmount;
}

function attackWillKill(monsterBaseDamage, fromFull) {
    monsterDamage = defaultFor(monsterBaseDamage, game.monster.damage);
    fromFull = defaultFor(fromFull, false);
    var damage = Math.max(0, monsterDamage - Math.floor(monsterDamage * (game.player.calculateDamageReduction() / 100)));
    var healAmount = game.player.abilities.getRejuvenatingStrikesHealAmount(0) * (game.player.attackType == AttackType.DOUBLE_STRIKE ? 2 : 1);
    var playerHealthAfterHeal = Math.min(game.player.getMaxHealth(), game.player.health +  healAmount);
    return (game.monster.canAttack || fromFull) && (fromFull ? game.player.getMaxHealth() : playerHealthAfterHeal) <= damage;
}

function shouldEquip(newItem) {
    var compareTo;
    var slot;
    switch (newItem.type) {
    case ItemType.HELM:
        slot = isBetterThan(game.equipment.helm(), newItem) ? 0 : -1;
        break;
    case ItemType.SHOULDERS:
        slot = isBetterThan(game.equipment.shoulders(), newItem) ? 1 : -1;
        break;
    case ItemType.CHEST:
        slot = isBetterThan(game.equipment.chest(), newItem) ? 2 : -1;
        break;
    case ItemType.LEGS:
        slot = isBetterThan(game.equipment.legs(), newItem) ? 3 : -1;
        break;
    case ItemType.WEAPON:
        slot = isBetterThan(game.equipment.weapon(), newItem) ? 4 : -1;
        break;
    case ItemType.GLOVES:
        slot = isBetterThan(game.equipment.gloves(), newItem) ? 5 : -1;
        break;
    case ItemType.BOOTS:
        slot = isBetterThan(game.equipment.boots(), newItem) ? 6 : -1;
        break;
    case ItemType.TRINKET:
        slot = isBetterThan(game.equipment.trinket1(), newItem) ? 7 : -1;
        if ((slot == -1) && isBetterThan(game.equipment.trinket2(), newItem)) {
            slot = 8;
        }
        break;
    case ItemType.OFF_HAND:
        slot = isBetterThan(game.equipment.off_hand(), newItem) ? 9 : -1;
        break;
    }

    return slot;

}


function isBetterThan(oldItem, newItem) {

    if (newItem == null) return false;

    if (oldItem == null) return true;

    if (oldItem.type != newItem.type) return false;

    switch (oldItem.type) {
    case ItemType.WEAPON:
        return isBetterThanWeapon(oldItem, newItem);
    case ItemType.TRINKET:
        return isBetterThanTrinket(oldItem, newItem);
    default:
        return isBetterThanItem(oldItem, newItem);
    }
}


function isBetterThanWeapon(oldWeapon, newWeapon) {
    var oldHasCrushing = oldWeapon.effects.reduce(function (e, n) {
        return e.concat(n.type);
    }, []).indexOf("CRUSHING_BLOWS") > -1;
    var newHasCrushing = newWeapon.effects.reduce(function (e, n) {
        return e.concat(n.type);
    }, []).indexOf("CRUSHING_BLOWS") > -1;
    var oldAvgDamage = (oldWeapon.minDamage + oldWeapon.maxDamage) / 2 + oldWeapon.damageBonus;
    var newAvgDamage = (newWeapon.minDamage + newWeapon.maxDamage) / 2 + newWeapon.damageBonus;


    if (oldHasCrushing && !newHasCrushing) return false;
    if (newHasCrushing && !oldHasCrushing) return true;


    if (oldAvgDamage > newAvgDamage) return false;
    if (newAvgDamage > oldAvgDamage) return true;


    if (oldWeapon.effects.length > newWeapon.effects.length) return false;
    if (newWeapon.effects.length > oldWeapon.effects.length) return true;

    return isBetterThanStats(oldWeapon, newWeapon);

}

function isBetterThanTrinket(oldTrinket, newTrinket) {
    var oldEffects = oldTrinket.effects.reduce(function (e, n) {
        return e.concat(n.type);
    }, []);
    var newEffects = newTrinket.effects.reduce(function (e, n) {
        return e.concat(n.type);
    }, []);


    if (oldEffects.indexOf("SWIFTNESS") > -1 && newEffects.indexOf("SWIFTNESS") == -1) return false;
    if (newEffects.indexOf("SWIFTNESS") > -1 && oldEffects.indexOf("SWIFTNESS") == -1) return true;
    
    //Pillaging is pretty good too, though
    var pillageChange = newTrinket.effects.reduce(function(s,n) {return n.type == 'PILLAGING' ? n.value : 0}, 0) -
      oldTrinket.effects.reduce(function(s,n) {return n.type == 'PILLAGING' ? n.value : 0}, 0);
    if (pillageChange > 0) return true;
    if (pillageChange < 0) return false;


    return isBetterThanStats(oldTrinket, newTrinket);

}

function isBetterThanItem(oldItem, newItem) {
    var oldEffects = oldItem.effects.reduce(function (e, n) {
        return e.concat(n.type);
    }, []);
    var newEffects = newItem.effects.reduce(function (e, n) {
        return e.concat(n.type);
    }, []);


    if (oldEffects.indexOf("FLAME_IMBUED") > -1 && newEffects.indexOf("FLAME_IMBUED") == -1) return false;
    if (newEffects.indexOf("FLAME_IMBUED") > -1 && oldEffects.indexOf("FLAME_IMBUED") == -1) return true;


    if (oldEffects.indexOf("FROST_SHARDS") > -1 && newEffects.indexOf("FROST_SHARDS") == -1) return false;
    if (newEffects.indexOf("FROST_SHARDS") > -1 && oldEffects.indexOf("FROST_SHARDS") == -1) return true;


    if (oldEffects.indexOf("WOUNDING") > -1 && newEffects.indexOf("WOUNDING") == -1) return false;
    if (newEffects.indexOf("WOUNDING") > -1 && oldEffects.indexOf("WOUNDING") == -1) return true;

    if (oldEffects.indexOf("BARRIER") > -1 && newEffects.indexOf("BARRIER") == -1) return false;
    if (newEffects.indexOf("BARRIER") > -1 && oldEffects.indexOf("BARRIER") == -1) return true;


    return isBetterThanStats(oldItem, newItem);

}


function isBetterThanStats(oldItem, newItem) {
    var critChange = newItem.critChance - oldItem.critChance;
    critChange = critChange * ((game.player.powerShards / 100) + 1);


    if ((critChange < 0) && (game.player.getCritChance() + critChange < 100)) return false;

    if ((critChange > 0) && (game.player.getCritChance() < 100)) return true;

    var goldChange = newItem.goldGain - oldItem.goldGain;

    if (goldChange > 0) return true;
    if (goldChange < 0) return false;

    var rarityChange = newItem.itemRarity - oldItem.itemRarity
    if (rarityChange < 0 && game.player.getItemRarity() + rarityChange < maxItemRarity) return false;
    if (rarityChange > 0 && game.player.getItemRarity() + rarityChange <= maxItemRarity) return true;

    if (oldItem.strength > newItem.strength) return false;
    if (oldItem.strength < newItem.strength) return true;
    
    if (oldItem.health > newItem.health) return false;
    if (oldItem.health < newItem.health) return true;
    
    if (oldItem.agility > newItem.agility) return false;
    if (oldItem.agility < newItem.agility) return true;


    if (newItem.level > oldItem.level) return true;

    return false;
}

function getEstimatedDamage(mobLevel, assumeCrit, useMinimum) {
    mobLevel = defaultFor(mobLevel, game.player.level);
    assumeCrit = defaultFor(assumeCrit, true);
    useMinimum = defaultFor(useMinimum, false);

    var damageDone = 0;

    var attacks = 0;
    var averageDamage = 0;
    if (useMinimum) {
        averageDamage = game.player.getMinDamage();
    } else {
        averageDamage = (game.player.getMinDamage() + game.player.getMaxDamage()) / 2;
    }

    if (game.player.attackType == AttackType.POWER_STRIKE) {
        averageDamage *= 1.5;
    }

    averageDamage *= (game.player.getCritDamage() / 100) * (assumeCrit ? 1 : Math.min(100, (game.player.getCritChance() / 100)));


    var abilityDamage = 0;

    abilityDamage = game.player.abilities.getIceBladeDamage(0) + game.player.abilities.getFireBladeDamage(0);
    abilityDamage *= (game.player.getCritDamage() / 100) * (assumeCrit ? 1 : Math.min(100, (game.player.getCritChance() / 100)));

    attacks = 1;
    if (game.player.attackType == AttackType.DOUBLE_STRIKE) {
        attacks++;
    }

    var swiftnessEffects = game.player.getEffectsOfType(EffectType.SWIFTNESS);
    attacks *= (swiftnessEffects.length + 1);

    damageDone += averageDamage;
    damageDone += abilityDamage;

    damageDone *= attacks;

    var berserkingDamage = game.player.getEffectsOfType(EffectType.BERSERKING).reduce(function (e, b) {
        return e + (b.value * b.chance / 100);
    }, 0);
    damageDone += berserkingDamage * attacks;

    return damageDone;
}

function getMinimumDamage(monsterHealth) {
    var minimumDamage = 0;
    
    var crit = (game.player.getCritChance >= 100 ? true : false);

    var attacks = 0;
    var weaponDamage = game.player.getMinDamage();
    
    if (game.player.attackType == AttackType.POWER_STRIKE) {
        weaponDamage *= 1.5;
    }

    if (crit)
    {
        weaponDamage *= game.player.getCritDamage() / 100;
    }

    var crushingBlowsEffects = game.player.getEffectsOfType(EffectType.CRUSHING_BLOWS);
    var crushingBlowsModifier = 0;
    var crushingBlowsDamage = 0;
    if (crushingBlowsEffects.length > 0) {
        for (var y = 0; y < crushingBlowsEffects.length; y++) {
            crushingBlowsModifier += crushingBlowsEffects[y].value;
        }
    }

    crushingBlowsDamage = (crushingBlowsModifier/100)*monsterHealth;

    var abilityDamage = 0;

    abilityDamage = game.player.abilities.getIceBladeDamage(0) + game.player.abilities.getFireBladeDamage(0);
    if (crit)
    {
        abilityDamage *= game.player.getCritDamage() / 100;
    }

    damage += abilityDamage;
    
    
    minimumDamage = weaponDamage + abilityDamage + crushingBlowsDamage;

    if (game.player.attackType == AttackType.DOUBLE_STRIKE) {
        //recalculate crushing blows damage for second attack based on first attack already having happened
        crushingBlowsDamage = (crushingBlowsModifier/100)*(monsterHealth-minimumDamage);
        //If it's already dead, don't add negative damage
        crushingBlowsDamage = Math.max(crushingBlowsDamage,0);
        minimumDamage += weaponDamage + abilityDamage + crushingBlowsDamage;
    }

    return minimumDamage;
}

function hopBattle() {
    game.leaveBattle();
    game.enterBattle();
}

function attack() {
    if (!attackWillKill()) {
        attackButtonClick();
    }
}


function runQuest() {
    var EndlessBossType = defaultFor(QuestType.ENDLESS_BOSSKILL, "UNDEFINED");
    var checkBossQuests = false;
    if (canFarm(game.player.level, MonsterRarity.BOSS)) {
        checkBossQuests = true;
    }
    var quest = game.questsManager.quests.filter(function(x) { return x.type == QuestType.KILL || (checkBossQuests && x.type == EndlessBossType); })[0];
    
    switch (quest.type) {
        case QuestType.KILL:

            processMobForQuest(quest.typeId, MonsterRarity.COMMON);
            break;
        case EndlessBossType:
            processMobForQuest(game.player.level, MonsterRarity.BOSS);
            break;
    }
}

function processMobForQuest(level, rarity) {
    if (game.battleLevel != level) { 
        game.battleLevel = level;
        hopBattle();
    }
    while (game.monster.rarity != rarity) {
        hopBattle();   
    }
    attack();
}

function autoBuy() {
    var bestPurchase = efficiency()[0];
    var bestPurchaseCost = getCostOfPurchase(bestPurchase);
    while (game.player.gold > bestPurchaseCost) {
        doPurchase(bestPurchase);
        bestPurchase = efficiency()[0];
        bestPurchaseCost = getCostOfPurchase(bestPurchase);
    }
}

function getCostOfPurchase(purchase) {
    switch (purchase.type) {
        case ABPurchaseType.MERCENARY:
            return game.mercenaryManager[purchase.name.toLowerCase() + "Price"]
        case ABPurchaseType.UPGRADE:
            return getCostOfUpgrade(purchase.name);
            break;
        default:
            return Number.POSITIVE_INFINITY;
    }
}

function getCostOfUpgrade(name) {
    var index = game.upgradeManager.upgrades.reduce(function(e, u) { return e.concat(u.name.toUpperCase()); }, []).indexOf(name);
    return game.upgradeManager.upgrades[index].cost;
}

function doPurchase(purchase) {
    switch (purchase.type) {
        case ABPurchaseType.MERCENARY:
            game.mercenaryManager.purchaseMercenary(purchase.name);
            break;
        case ABPurchaseType.UPGRADE:
            purchaseUpgrade(purchase.name);
            break;
        default:

            break;
    }
}

function purchaseUpgrade(name) {
    var index = game.upgradeManager.upgrades.reduce(function(e, u) { return e.concat(u.name.toUpperCase()); }, []).indexOf(name);
    console.log(index);

    index = game.upgradeManager.purchaseButtonUpgradeIds.indexOf(index);
    console.log(index);
    
    game.upgradeManager.purchaseUpgrade(index);
    
}

function autoLevel() {
    while (game.player.skillPoints > 0) {

        if ((game.player.skillPointsSpent + 2) % 5 == 0) {
            abilityLevelUp();
        } else {
            statLevelUp();
        }
    }
    
    if (game.player.skillPoints <= 0) $("#levelUpButton").hide();
}

function abilityLevelUp() {
    $("#abilityUpgradesWindow").hide();
    
    var ability = getBestAbilityName();
    
    console.log('Leveling to level ' + (game.player.skillPointsSpent + 2) + ' with ability ' + ability);
    
    game.player.increaseAbilityPower(ability);
    
}

function getBestAbilityName() {
    var ability;
    var rejuvHealAmount = game.player.abilities.getRejuvenatingStrikesHealAmount(0);
    if (game.player.getMaxHealth() > (rejuvHealAmount * (game.player.attackType == AttackType.DOUBLE_STRIKE ? 2 : 1))) {
        ability = AbilityName.REJUVENATING_STRIKES;
    } else {
        
        if (game.player.abilities.baseIceBladeLevel == 0) {
            ability = AbilityName.ICE_BLADE;
        } else if (game.player.abilities.baseRendLevel == 0) {
            ability = AbilityName.REND;
        } else {
            ability = AbilityName.FIRE_BLADE;
        }
    }
    
    return ability;
}

function statLevelUp() {
    
    var index = getIndexOfBestUpgrade();

    console.log('Leveling to level ' + (game.player.skillPointsSpent + 2) + ' with stat ' + game.statUpgradesManager.upgrades[0][index].type);


    statUpgradeButtonClick(document.getElementById('statUpgradeButton1'),index+1);
    
}

function getIndexOfBestUpgrade() {
    var upgradeNames = game.statUpgradesManager.upgrades[0].reduce(function (l, u) {
        return l.concat(u.type);
    }, []);
    
    var index = upgradeNames.indexOf(StatUpgradeType.ITEM_RARITY);
    if ((getItemRarityWithoutItems() <= maxItemRarity) && index > -1) return index;
    
    index = upgradeNames.indexOf(StatUpgradeType.GOLD_GAIN);
    if (index>-1) return index;
    
    index = upgradeNames.indexOf(StatUpgradeType.EXPERIENCE_GAIN);
    if (index>-1) return index;
    
    index = upgradeNames.indexOf(StatUpgradeType.STRENGTH);
    var index2 = upgradeNames.indexOf(StatUpgradeType.DAMAGE);
    
    if (index > -1) {
        if (index2 > -1) {
            if ((game.statUpgradesManager.upgrades[0][index].amount * 1.05) > game.statUpgradesManager.upgrades[0][index2].amount) {
                return index;
            } else {
                return index2;
            }
        } else {

            return index;
        }
    } else if (index2 > -1) {
        
        return index2;
    }
    

    index = upgradeNames.indexOf(StatUpgradeType.AGILITY);
    index2 = upgradeNames.indexOf(StatUpgradeType.CRIT_DAMAGE);
    
        if (index > -1) {
        if (index2 > -1) {

            if ((game.statUpgradesManager.upgrades[0][index].amount * (((game.player.powerShards / 100) + 1)*.2)) > game.statUpgradesManager.upgrades[0][index2].amount) {
                return index;
            } else {
                return index2;
            }
        } else {

            return index;
        }
    } else if (index2 > -1) {

        return index2;
    }
    

    return 0;
}


function getItemRarityWithoutItems() {
    return (game.player.baseStats.itemRarity + game.player.chosenLevelUpBonuses.itemRarity) * ((game.player.powerShards / 100) + 1);
}


function calculateXP() {
    var earnedXP = game.stats.experienceEarned - lastXP;
    lastXP = game.stats.experienceEarned;
    XPS = earnedXP / 5;
}

function goodQuestAvailable() {
    var EndlessBossType = defaultFor(QuestType.ENDLESS_BOSSKILL, "UNDEFINED");
    var checkBossQuests = false;
    if (canFarm(game.player.level, MonsterRarity.BOSS)) {

        checkBossQuests = true;
    }
    return game.questsManager.quests.filter(function(x) { return x.type == QuestType.KILL || (checkBossQuests && x.type == EndlessBossType); }).length > 0;
}

function autoFight() {
    if (game.inBattle) {

        if (autoQuestEnabled && goodQuestAvailable()) {
            runQuest();
        } else if (lootFarm) {
            game.battleLevel = lootFarmStep;
            if (game.monster.level != game.battleLevel) {
                hopBattle();
            }
            while ((lootFarmRarities.indexOf(game.monster.rarity) == -1) && (game.monster.rarity != maxMonsterRarity(game.battleLevel))) {
                hopBattle();
            }
            attack();
        } else {
            game.battleLevel = XPFarmLevel;
            while (game.monster.rarity != MonsterRarity.COMMON) {
                hopBattle();
            } 
            attack();
        }
    }
}

function autoBattleStart() {
    
    if (autoMobLevelUpdateEnabled) {
        if (autoMobLevelUpdateBot) clearInterval(autoMobLevelUpdateBot);
        updateMobLevels();
        autoMobLevelUpdateBot = setInterval(function () {
            updateMobLevels();
        }, autoMobLevelUpdateBotInterval);
    } else {
        if (autoMobLevelUpdateBot) clearInterval(autoMobLevelUpdateBot);
        autoMobLevelUpdateBot = 0;
    }

    if (autoInventoryEnabled) {
        if (autoInventoryBot) clearInterval(autoInventoryBot);
        equipAndSellInventory();
        autoInventoryBot = setInterval(function () {
            equipAndSellInventory();
        }, autoInventoryBotInterval);
    } else {
        if (autoInventoryBot) clearInterval(autoInventoryBot);
        autoInventoryBot = 0;
    }
    
    if (autoLevelEnabled) {
        if (autoLevelBot) clearInterval(autoLevelBot);
        autoLevel();
        autoLevelBot = setInterval(function () {
            autoLevel();
        }, autoLevelBotInterval);
    } else {
        if (autoLevelBot) clearInterval(autoLevelBot);
        autoLevelBot = 0;
    }

    if (autoBuyEnabled) {
        if (autoBuyBot) clearInterval(autoBuyBot);
        autoBuy();
        autoBuyBot = setInterval(function () {
            autoBuy();
        }, autoBuyBotInterval);
    } else {
        if (autoBuyBot) clearInterval(autoBuyBot);
        autoBuyBot = 0;
    }
    
    if (autoFightEnabled) {
        if (autoFightBot) clearInterval(autoFightBot);
        autoBuy();
        autoFightBot = setInterval(function () {
            autoFight();
        }, autoFightBotInterval);
    } else {
        if (autoFightBot) clearInterval(autoFightBot);
        autoFightBot = 0;
    }

    turnOnLoot();
    
    initializeAutoBattleUI();

}
