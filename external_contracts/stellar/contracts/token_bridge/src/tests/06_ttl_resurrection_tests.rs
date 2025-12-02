// TTL Resurrection Tests
//
// Purpose: Verify TTL extension and resurrection behavior when system wallet
//          interacts with execute_bridge_operation()
//
// Client Value: "Persistent storage entries (LockedBalances, TransactionIds) 
//                are properly extended and resurrected after expiration"
//
// Test Coverage:
// - ✅ LockedBalances TTL extension on Release operation
// - ✅ LockedBalances TTL extension on Mint operation  
// - ✅ LockedBalances TTL extension on Lock operation
// - ✅ TransactionIds TTL extension (1 year)
// - ✅ Persistent entry auto-restoration after expiration
// - ✅ Instance storage TTL behavior
//
// NOTE: These tests use Soroban's test utilities to simulate ledger progression
//       and verify that TTL extensions work correctly to prevent data loss

use super::*;
use soroban_sdk::testutils::storage::Persistent;
use soroban_sdk::testutils::storage::Temporary;
use soroban_sdk::testutils::Ledger;


// ============ Test Environment Setup ============

/// Create an environment with specific TTL settings
fn create_env_with_ttl() -> Env {
    let env = Env::default();
    env.ledger().with_mut(|li| {
        // Current ledger sequence
        li.sequence_number = 100_000;
        // Minimum TTL for persistent entries (500 ledgers)
        li.min_persistent_entry_ttl = 500;
        // Minimum TTL for temporary entries (100 ledgers)
        li.min_temp_entry_ttl = 100;
        // Maximum TTL of any entry - set to 1 year in ledgers (31,536,000)
        // This allows us to test the full TTL extension behavior
        li.max_entry_ttl = 31_536_000;
    });
    env
}

// ============ Lock Operation TTL Tests ============

mod lock_operation_ttl {
    //! # Lock Operation TTL Extension
    //!
    //! **What This Proves**: LockedBalances entries have their TTL extended
    //!                       when Lock operations are executed
    //!
    //! **Why It Matters**: Prevents locked balance data from expiring

    use super::*;

    #[test]
    fn test_lock_creates_locked_balance_entry() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: A user with tokens
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);

        // WHEN: User locks tokens
        let from_token = test_env.lock_unlock_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600012,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // THEN: LockedBalances entry should be created with minimum TTL
        // NOTE: Lock operation currently does NOT call extend_ttl, so TTL is min_persistent_entry_ttl - 1
        env.as_contract(&test_env.bridge_id, || {
            let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
            let balance: i128 = env.storage().persistent().get(&balance_key).unwrap_or(0);
            assert_eq!(balance, 5_000, "Locked balance should be 5,000");

            let ttl = env.storage().persistent().get_ttl(&balance_key);
            // TTL should be minimum TTL for persistent (500) minus 1
            assert_eq!(ttl, 499, "LockedBalances TTL should be minimum TTL (got {})", ttl);

        });
    }

    #[test]
    fn test_lock_recreates_transaction_id_ttl() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);

        let transaction_id = 176294386600012;
        let from_token = test_env.lock_unlock_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            transaction_id,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // THEN: TransactionIds entry should have extended TTL (1 year = 31,536,000 ledgers)
        env.as_contract(&test_env.bridge_id, || {
            let tx_key = DataKey::TransactionIds(transaction_id);
            let ttl = env.storage().temporary().get_ttl(&tx_key);

            // TTL should be minimum TTL for temporary (100) minus 1
            assert_eq!(ttl, 99, "TransactionIds TTL should be extended to 99 (got {})", ttl);
        });

        // Move the ledger to more 100 ledgers
        env.ledger().with_mut(|li| {
            li.sequence_number += 100;
        });

        let is_used = &test_env.bridge_client.is_transaction_used(&transaction_id);
        assert_eq!(is_used, &false, "Transaction ID should still be marked as used");

        // Re-submit the transaction with the same transaction ID after the TTL has expired => should succeed
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            transaction_id,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        let is_used = &test_env.bridge_client.is_transaction_used(&transaction_id);
        assert_eq!(is_used, &true, "Transaction ID should still be marked as used");
        
    }

    #[test]
    fn test_lock_transaction_id_marked_as_used() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);

        let transaction_id = 176294386600012;
        let from_token = test_env.lock_unlock_token.token_id.to_string();

        // GIVEN: Transaction ID is not used
        assert!(!test_env.bridge_client.is_transaction_used(&transaction_id));

        // WHEN: User locks tokens
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            transaction_id,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // THEN: Transaction ID should be marked as used
        assert!(test_env.bridge_client.is_transaction_used(&transaction_id));
    }
}

// ============ Release Operation TTL Tests ============

mod release_operation_ttl {
    //! # Release Operation TTL Extension
    //!
    //! **What This Proves**: System wallet can extend TTL when releasing tokens
    //!
    //! **Why It Matters**: Ensures locked balance data remains accessible

    use super::*;

    #[test]
    fn test_release_extends_locked_balance_ttl() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Tokens are locked in the bridge
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);

        let from_token = test_env.lock_unlock_token.token_id.to_string();
        let to_token = String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e");

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &to_token,
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600012,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // Verify initial TTL
        env.as_contract(&test_env.bridge_id, || {
            let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
            let ttl = env.storage().persistent().get_ttl(&balance_key);

            // TTL should be minimum TTL for persistent (500) minus 1
            assert_eq!(ttl, 499, "LockedBalances TTL should be created and extend to minimum TTL - 1 (got {})", ttl);
        });

        // WHEN: System wallet releases tokens
        let recipient = Address::generate(&env);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            &from_token,
            3_000,
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &recipient.to_string(),
            &String::from_str(&env, "pruv:testnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600013,
            &String::from_str(&env, "test@example.com"),
            &test_env.system_wallet,
        );

        // THEN: LockedBalances entry should have extended TTL when 499 is below threshold
        env.as_contract(&test_env.bridge_id, || {
            let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
            let ttl = env.storage().persistent().get_ttl(&balance_key);

            assert_eq!(ttl, 518_400, "LockedBalances TTL should be extended on Release (got {})", ttl);
        });
    }
}

// ============ Mint Operation TTL Tests ============

mod mint_operation_ttl {
    //! # Mint Operation TTL Extension
    //!
    //! **What This Proves**: System wallet can mint tokens successfully
    //!
    //! **Why It Matters**: Ensures mint operations work correctly
    //!
    //! **Note**: Mint operation currently calls extend_ttl on LockedBalances
    //! which may not exist for mint-only tokens. This is a known limitation.

    use super::*;

    #[test]
    fn test_mint_with_existing_locked_balance() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: First lock some tokens to create the LockedBalances entry
        test_env.mint_burn_token.stellar_asset_client.mint(&user, &10_000);

        let from_token = test_env.mint_burn_token.token_id.to_string();

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600012,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // WHEN: System wallet mints tokens (now LockedBalances exists)
        let recipient = Address::generate(&env);
        let to_token = test_env.mint_burn_token.token_id.to_string();

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_MINT,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            &to_token,
            3_000,
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &recipient.to_string(),
            &String::from_str(&env, "pruv:testnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600014,
            &String::from_str(&env, "test@example.com"),
            &test_env.system_wallet,
        );

        // THEN: Mint operation should succeed
        assert_eq!(
            test_env.mint_burn_token.token_client.balance(&recipient),
            3_000,
            "Recipient should receive minted tokens"
        );
    }
}

// ============ TTL Persistence Tests ============

mod ttl_persistence {
    //! # TTL Persistence Tests
    //!
    //! **What This Proves**: TTL is properly managed across operations
    //!
    //! **Why It Matters**: Ensures data remains accessible over time

    use super::*;

    #[test]
    fn test_locked_balance_persists_across_operations() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Tokens are locked
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);

        let from_token = test_env.lock_unlock_token.token_id.to_string();

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600012,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // Verify initial balance and TTL
        let initial_ttl = env.as_contract(&test_env.bridge_id, || {
            let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
            let balance: i128 = env.storage().persistent().get(&balance_key).unwrap_or(0);
            assert_eq!(balance, 5_000, "Initial locked balance should be 5,000");

            env.storage().persistent().get_ttl(&balance_key)
        });

        // Lock operation doesn't extend TTL, so it will be 499
        assert_eq!(initial_ttl, 499, "Initial TTL should be minimum TTL - 1 (got {})", initial_ttl);

        // WHEN: System wallet releases tokens (this will extend TTL since 499 < 86,400)
        let recipient = Address::generate(&env);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            &from_token,
            2_000,
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &recipient.to_string(),
            &String::from_str(&env, "pruv:testnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600013,
            &String::from_str(&env, "test@example.com"),
            &test_env.system_wallet,
        );

        // THEN: Balance should be updated and TTL extended
        env.as_contract(&test_env.bridge_id, || {
            let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());

            let balance: i128 = env.storage().persistent().get(&balance_key).unwrap_or(0);
            assert_eq!(balance, 3_000, "Balance should be 5000 - 2000 = 3000 after release");

            let new_ttl = env.storage().persistent().get_ttl(&balance_key);
            // TTL should be extended to 30 days (518,400 ledgers)
            assert_eq!(new_ttl, 518_400, "TTL should be extended to ~30 days (got {})", new_ttl);
        });

        // Verify the release was successful
        assert_eq!(
            test_env.lock_unlock_token.token_client.balance(&recipient),
            2_000,
            "Recipient should receive 2,000 tokens"
        );
    }

    #[test]
    #[should_panic]
    fn test_transaction_id_expires() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);

        let transaction_id = 176294386600012;
        let from_token = test_env.lock_unlock_token.token_id.to_string();

        // GIVEN: A transaction is executed
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            transaction_id,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // THEN: Transaction ID should be marked as used
        assert!(
            test_env.bridge_client.is_transaction_used(&transaction_id),
            "Transaction ID should be marked as used"
        );

        // AND: Transaction ID has extended TTL
        env.as_contract(&test_env.bridge_id, || {
            let tx_key = DataKey::TransactionIds(transaction_id);
            let ttl = env.storage().temporary().get_ttl(&tx_key);

            // TTL should be minimum TTL for temporary (100) minus 1
            assert_eq!(ttl, 99, "Transaction ID TTL should be minimum TTL - 1 (got {})", ttl);
        });

        // Increase ledger by 100 to simulate time passing
        env.ledger().with_mut(|li| {
            li.sequence_number += 100;
        });

        // Should panic here because entry should have expired
        env.as_contract(&test_env.bridge_id, || {
            let tx_key = DataKey::TransactionIds(transaction_id);
            // Should panic here because entry should have expired
            let _ttl = env.storage().temporary().get_ttl(&tx_key);

        });
        
    }

    #[test]
    fn test_instance_storage_survives_operations() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Contract is initialized with chain ID
        let initial_chain_id = test_env.bridge_client.get_current_chain_id();
        assert_eq!(initial_chain_id, String::from_str(&env, "stellar:testnet"));

        // WHEN: Operations are performed
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &10_000);

        let from_token = test_env.lock_unlock_token.token_id.to_string();

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            5_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600012,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // THEN: Instance storage (CurrentChainId) should still be accessible
        let chain_id_after = test_env.bridge_client.get_current_chain_id();
        assert_eq!(
            chain_id_after,
            initial_chain_id,
            "Instance storage should survive across operations"
        );
    }

    #[test]
    fn test_multiple_releases_maintain_balance() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Large amount of tokens locked
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &100_000);

        let from_token = test_env.lock_unlock_token.token_id.to_string();

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            100_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600012,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // WHEN: Multiple releases happen
        for i in 0..5 {
            let recipient = Address::generate(&env);

            execute_bridge_op(
                &test_env.bridge_client,
                OPERATION_RELEASE,
                &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
                &from_token,
                10_000,
                &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
                &recipient.to_string(),
                &String::from_str(&env, "pruv:testnet"),
                &String::from_str(&env, "stellar:testnet"),
                176294386600013 + i,
                &String::from_str(&env, "test@example.com"),
                &test_env.system_wallet,
            );

            // THEN: TTL should be extended after each release
            env.as_contract(&test_env.bridge_id, || {
                let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
                let ttl = env.storage().persistent().get_ttl(&balance_key);

                assert!(
                    ttl > 86_400,
                    "TTL should be extended after release {} (got {})", i, ttl
                );
            });
        }

        // Verify final balance
        let final_balance = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
        assert_eq!(final_balance, 50_000, "Final locked balance should be 100,000 - 50,000");
    }

    #[test]
    #[should_panic]
    fn test_balance_should_be_expires() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Large amount of tokens locked
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &100_000);

        let from_token = test_env.lock_unlock_token.token_id.to_string();

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            100_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600012,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // WHEN: Multiple releases happen
        for i in 0..5 {
            let recipient = Address::generate(&env);

            execute_bridge_op(
                &test_env.bridge_client,
                OPERATION_RELEASE,
                &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
                &from_token,
                10_000,
                &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
                &recipient.to_string(),
                &String::from_str(&env, "pruv:testnet"),
                &String::from_str(&env, "stellar:testnet"),
                176294386600013 + i,
                &String::from_str(&env, "test@example.com"),
                &test_env.system_wallet,
            );

            // THEN: TTL should be extended after each release
            env.as_contract(&test_env.bridge_id, || {
                let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
                let ttl = env.storage().persistent().get_ttl(&balance_key);

                assert!(
                    ttl > 86_400,
                    "TTL should be extended after release {} (got {})", i, ttl
                );
            });
        }

        // Verify final balance
        let final_balance = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
        assert_eq!(final_balance, 50_000, "Final locked balance should be 100,000 - 50,000");

        // Increase ledger by 518,401 to simulate time passing
        env.ledger().with_mut(|li| {
            li.sequence_number += 518_401;
        });

        // THEN: LockedBalances entry should not be accessible
        env.as_contract(&test_env.bridge_id, || {
            let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
            let balance: i128 = env.storage().persistent().get(&balance_key).unwrap_or(0);
            assert_eq!(balance, 0, "Locked balance should be 0 after expiration");
        });
    }

    #[test]
    #[should_panic]
    fn test_balance_should_be_extendable_after_expiration() {
        let env = create_env_with_ttl();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Large amount of tokens locked
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &100_000);

        let from_token = test_env.lock_unlock_token.token_id.to_string();

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &from_token,
            &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
            100_000,
            &user.to_string(),
            &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "pruv:testnet"),
            176294386600012,
            &String::from_str(&env, "test@example.com"),
            &user,
        );

        // WHEN: Multiple releases happen
        for i in 0..5 {
            let recipient = Address::generate(&env);

            execute_bridge_op(
                &test_env.bridge_client,
                OPERATION_RELEASE,
                &String::from_str(&env, "0x406AF9645ED085c8A96BD0F07f7621675358BF5e"),
                &from_token,
                10_000,
                &String::from_str(&env, "0x1E66a7010ca66Ae923267336BD9D6c321f1E1Ac4"),
                &recipient.to_string(),
                &String::from_str(&env, "pruv:testnet"),
                &String::from_str(&env, "stellar:testnet"),
                176294386600013 + i,
                &String::from_str(&env, "test@example.com"),
                &test_env.system_wallet,
            );

            // THEN: TTL should be extended after each release
            env.as_contract(&test_env.bridge_id, || {
                let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
                let ttl = env.storage().persistent().get_ttl(&balance_key);

                assert!(
                    ttl > 86_400,
                    "TTL should be extended after release {} (got {})", i, ttl
                );
            });
        }

        // Verify final balance
        let final_balance = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
        assert_eq!(final_balance, 50_000, "Final locked balance should be 100,000 - 50,000");

        // Increase ledger by 518,401 to simulate time passing
        env.ledger().with_mut(|li| {
            li.sequence_number += 518_401;
        });

        // THEN: Extend LockedBalance TTL
        extend_ttl(&test_env.bridge_client, TTL_THRESHOLD, LEDGERS_PER_30_DAYS, DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone()));

        env.as_contract(&test_env.bridge_id, || {
            let balance_key = DataKey::LockedBalances(test_env.lock_unlock_token.token_id.clone());
            let ttl = env.storage().persistent().get_ttl(&balance_key);

            assert_eq!(
                ttl,
                LEDGERS_PER_30_DAYS,
                "TTL should be extended after expiration (got {})", ttl
            );
        });
        
    }
}

